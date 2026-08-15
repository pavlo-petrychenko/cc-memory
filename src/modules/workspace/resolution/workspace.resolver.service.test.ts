import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import {
  worktreeSlug,
  WorkspaceResolverService,
} from "@/modules/workspace/resolution/workspace.resolver.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";

const HOME = absPath("/home/test");

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

const resolver = new WorkspaceResolverService(new WorkspaceValidatorService());

describe("WorkspaceResolverService.resolveWorkspace", () => {
  test("longest prefix wins", () => {
    const resolved = resolver.resolveWorkspace(
      [outer, inner],
      absPath("/tmp/code/acme/sub"),
      HOME,
    );
    expect(resolved?.id).toBe("inner");
    expect(resolved?.matchedPrefix).toBe(absPath("/tmp/code/acme"));
  });

  test("no match is null — the isolation boundary", () => {
    expect(
      resolver.resolveWorkspace([outer, inner], absPath("/elsewhere"), HOME),
    ).toBeNull();
  });
});

describe("worktreeSlug (pure)", () => {
  const ws: Workspace = {
    id: "acme",
    match: [absPath("/tmp/code/acme")],
    kb: absPath("/tmp/InnerKB"),
    worklogs: absPath("/tmp/InnerKB/_Worklogs"),
    exclude: [],
    indexDb: absPath("/tmp/inner.db"),
    matchedPrefix: absPath("/tmp/code/acme"),
  };

  test("falls back to the cwd path relative to the prefix without a git toplevel", () => {
    expect(worktreeSlug("", absPath("/tmp/code/acme/sub/dir"), ws)).toBe("sub-dir");
  });

  test("prefers the git toplevel when it lies inside the matched prefix", () => {
    expect(
      worktreeSlug(
        "/tmp/code/acme/worktree-a\n",
        absPath("/tmp/code/acme/worktree-a/src"),
        ws,
      ),
    ).toBe("worktree-a");
  });
});
