import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { RegistryTomlSerializer } from "@/workspace/serializers/registryToml/registryToml.serializer.ts";
import { RegistryService } from "@/workspace/services/registry/registry.service.ts";
import { WorkspaceResolverService } from "@/workspace/services/resolver/resolver.service.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup. Every
// absolute-path literal in this file is a hand-written, already-absolute,
// already-normalized POSIX path, so
// casting it once here (rather than routing every one through `expandPath`) is
// the one place this file trusts that by construction.
function absPath(raw: string): AbsPath {
  // SAFETY: see the doc comment above — every call site in this file passes an
  // already-absolute, already-normalized POSIX path literal.
  return raw as AbsPath;
}

const HOME = absPath("/home/test");

function makeResolverService(git = makeGitFake()) {
  const registryService = new RegistryService(
    makeFsMemoryFake(),
    new RegistryTomlSerializer(),
  );
  return { git, resolverService: new WorkspaceResolverService(registryService, git) };
}

/**
 * Two workspaces, `outer` matching `<tmp>/code` and `inner` (nested)
 * matching `<tmp>/code/acme` — the longest matching prefix must win.
 */
describe("WorkspaceResolverService.resolveWorkspace — longest-prefix match", () => {
  const outer: RawWorkspace = {
    id: "outer",
    match: ["/tmp/code"],
    kb: "/tmp/OuterKB",
    worklogs: "/tmp/OuterKB/_Worklogs",
    exclude: [],
    indexDb: "/tmp/outer.db",
  };
  const inner: RawWorkspace = {
    id: "inner",
    match: ["/tmp/code/acme"],
    kb: "/tmp/InnerKB",
    worklogs: "/tmp/InnerKB/_Worklogs",
    exclude: [],
    indexDb: "/tmp/inner.db",
  };
  const raws = [outer, inner];

  test("longest prefix wins (a cwd nested under both matches the inner one)", () => {
    const { resolverService } = makeResolverService();
    const resolved = resolverService.resolveWorkspace(
      raws,
      absPath("/tmp/code/acme/sub/dir"),
      HOME,
    );
    expect(resolved?.id).toBe("inner");
    expect(resolved?.matchedPrefix).toBe(absPath("/tmp/code/acme"));
  });

  test("outer prefix wins for a cwd only the outer workspace matches", () => {
    const { resolverService } = makeResolverService();
    const resolved = resolverService.resolveWorkspace(
      raws,
      absPath("/tmp/code/other"),
      HOME,
    );
    expect(resolved?.id).toBe("outer");
    expect(resolved?.matchedPrefix).toBe(absPath("/tmp/code"));
  });

  test("no match is null — the isolation boundary", () => {
    const { resolverService } = makeResolverService();
    expect(
      resolverService.resolveWorkspace(raws, absPath("/tmp/somewhere/else"), HOME),
    ).toBeNull();
  });
});

describe("WorkspaceResolverService.resolveWorkspace — two-workspace isolation", () => {
  const alpha: RawWorkspace = {
    id: "alpha",
    match: ["~/Projects/alpha"],
    kb: "~/Vaults/Alpha",
    worklogs: "~/Vaults/Alpha/_Worklogs",
    exclude: [],
    indexDb: "~/.claude/memory/alpha/index.db",
  };
  const beta: RawWorkspace = {
    id: "beta",
    match: ["~/Projects/beta"],
    kb: "~/Vaults/Beta",
    worklogs: "~/Vaults/Beta/_Worklogs",
    exclude: [],
    indexDb: "~/.claude/memory/beta/index.db",
  };
  const raws = [alpha, beta];

  test("a cwd under alpha resolves only to alpha, never beta", () => {
    const { resolverService } = makeResolverService();
    const cwd = expandPath("~/Projects/alpha/src", HOME);
    const resolved = resolverService.resolveWorkspace(raws, cwd, HOME);
    expect(resolved?.id).toBe("alpha");
  });

  test("a cwd under beta resolves only to beta, never alpha", () => {
    const { resolverService } = makeResolverService();
    const cwd = expandPath("~/Projects/beta/src", HOME);
    const resolved = resolverService.resolveWorkspace(raws, cwd, HOME);
    expect(resolved?.id).toBe("beta");
  });

  test("a cwd exactly equal to a match prefix resolves (not just strictly nested)", () => {
    const { resolverService } = makeResolverService();
    const cwd = expandPath("~/Projects/alpha", HOME);
    expect(resolverService.resolveWorkspace(raws, cwd, HOME)?.id).toBe("alpha");
  });

  test("a sibling directory that merely shares a string prefix is no match", () => {
    const { resolverService } = makeResolverService();
    const cwd = expandPath("~/Projects/alpha2", HOME);
    expect(resolverService.resolveWorkspace(raws, cwd, HOME)).toBeNull();
  });
});

describe("WorkspaceResolverService.worktreeSlug", () => {
  const matchedPrefix = absPath("/tmp/code/acme");
  const ws: Workspace = {
    id: "acme",
    match: [matchedPrefix],
    kb: absPath("/tmp/InnerKB"),
    worklogs: absPath("/tmp/InnerKB/_Worklogs"),
    exclude: [],
    indexDb: absPath("/tmp/inner.db"),
    matchedPrefix,
  };

  test("cwd equal to the matched prefix is the repo root", async () => {
    const git = makeGitFake();
    git.setShowToplevel(""); // not a git repo
    const { resolverService } = makeResolverService(git);
    const slug = await resolverService.worktreeSlug(ws.matchedPrefix, ws);
    expect(slug).toBe("_root");
  });

  test("falls back to cwd's path relative to the prefix when there's no git toplevel", async () => {
    const git = makeGitFake();
    git.setShowToplevel("");
    const { resolverService } = makeResolverService(git);
    const cwd = absPath(`${matchedPrefix}/sub/dir`);
    const slug = await resolverService.worktreeSlug(cwd, ws);
    expect(slug).toBe("sub-dir");
  });

  test("prefers the git toplevel when it lies inside the matched prefix", async () => {
    const git = makeGitFake();
    // A git worktree rooted one level below the matched prefix — distinct from
    // `cwd`, which is deeper still.
    git.setShowToplevel(`${matchedPrefix}/worktree-a\n`);
    const { resolverService } = makeResolverService(git);
    const cwd = absPath(`${matchedPrefix}/worktree-a/src`);
    const slug = await resolverService.worktreeSlug(cwd, ws);
    expect(slug).toBe("worktree-a");
  });

  test("ignores a git toplevel that lies outside the matched prefix", async () => {
    const git = makeGitFake();
    git.setShowToplevel("/somewhere/else\n");
    const { resolverService } = makeResolverService(git);
    const cwd = absPath(`${matchedPrefix}/sub`);
    const slug = await resolverService.worktreeSlug(cwd, ws);
    expect(slug).toBe("sub");
  });

  test("a git toplevel exactly equal to the matched prefix is the repo root", async () => {
    const git = makeGitFake();
    git.setShowToplevel(`${matchedPrefix}\n`);
    const { resolverService } = makeResolverService(git);
    const cwd = absPath(`${matchedPrefix}/sub`);
    const slug = await resolverService.worktreeSlug(cwd, ws);
    expect(slug).toBe("_root");
  });

  test("sanitizes unsafe characters in the relative path", async () => {
    const git = makeGitFake();
    git.setShowToplevel("");
    const { resolverService } = makeResolverService(git);
    const cwd = absPath(`${matchedPrefix}/feature branch!`);
    const slug = await resolverService.worktreeSlug(cwd, ws);
    expect(slug).toBe("feature-branch");
  });
});
