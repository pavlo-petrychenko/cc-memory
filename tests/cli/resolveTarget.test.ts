import { describe, expect, test } from "bun:test";

import {
  loadRegistryForCli,
  NO_WORKSPACE_FOR_CWD_MESSAGE,
  noSuchWorkspaceMessage,
  resolveTargetWorkspaces,
  resolveWorkspaceForCwd,
} from "../../src/cli/resolveTarget.service.ts";
import type { AbsPath } from "../../src/core/AbsPath.ts";
import { expandPath } from "../../src/core/paths.ts";
import type { RawWorkspace } from "../../src/core/Workspace.ts";
import { makeFsMemoryFake } from "../helpers/fakes/fsMemory.fake.ts";

// SAFETY: a fixed test fixture, same pattern as tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;

function raw(id: string, matchPath: string): RawWorkspace {
  return {
    id,
    match: [matchPath],
    kb: `/vault-${id}`,
    worklogs: `/vault-${id}/_Worklogs`,
    exclude: [],
    indexDb: `/idx-${id}/index.db`,
  };
}

const PRIMARY = raw("primary", "/repo/primary");
const SECONDARY = raw("secondary", "/repo/secondary");
const RAWS: readonly RawWorkspace[] = [PRIMARY, SECONDARY];

describe("resolveTargetWorkspaces (reindex/commit)", () => {
  test("id === null resolves every registered workspace, expanded, in registry order", () => {
    const result = resolveTargetWorkspaces(RAWS, HOME, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((ws) => ws.id)).toEqual(["primary", "secondary"]);
  });

  test("a known id resolves to exactly that one workspace", () => {
    const result = resolveTargetWorkspaces(RAWS, HOME, "secondary");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((ws) => ws.id)).toEqual(["secondary"]);
  });

  test("an unknown id fails with the exact 'no such workspace' message", () => {
    const result = resolveTargetWorkspaces(RAWS, HOME, "ghost");
    expect(result).toEqual({ ok: false, error: "no such workspace: ghost" });
  });
});

describe("resolveWorkspaceForCwd (search/notes)", () => {
  test("an explicit --workspace id wins even when cwd would resolve elsewhere", () => {
    const cwd = expandPath("/repo/primary/wt1", HOME);
    const result = resolveWorkspaceForCwd(RAWS, HOME, cwd, "secondary");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("secondary");
  });

  test("an unknown --workspace id fails with the exact 'no such workspace' message", () => {
    const cwd = expandPath("/repo/primary", HOME);
    const result = resolveWorkspaceForCwd(RAWS, HOME, cwd, "ghost");
    expect(result).toEqual({ ok: false, error: "no such workspace: ghost" });
  });

  test("no --workspace falls back to cwd resolution (longest-prefix match)", () => {
    const cwd = expandPath("/repo/secondary/wt1", HOME);
    const result = resolveWorkspaceForCwd(RAWS, HOME, cwd, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("secondary");
  });

  test("a cwd under no workspace fails with the exact 'no workspace for cwd' message", () => {
    const cwd = expandPath("/elsewhere", HOME);
    const result = resolveWorkspaceForCwd(RAWS, HOME, cwd, null);
    expect(result).toEqual({ ok: false, error: NO_WORKSPACE_FOR_CWD_MESSAGE });
  });
});

describe("noSuchWorkspaceMessage", () => {
  test("shared by both resolvers verbatim", () => {
    expect(noSuchWorkspaceMessage("x")).toBe("no such workspace: x");
  });
});

describe("loadRegistryForCli", () => {
  test("a missing registry file loads as an empty list, not a failure", async () => {
    const fs = makeFsMemoryFake();
    const result = await loadRegistryForCli(fs, HOME);
    expect(result).toEqual({ ok: true, value: [] });
  });

  test("a present-but-malformed registry maps to a CliOutcome failure", async () => {
    const fs = makeFsMemoryFake();
    const registryPath = expandPath("~/.claude/memory/registry.toml", HOME);
    fs.seedFile(registryPath, "this is not valid toml [[[");
    const result = await loadRegistryForCli(fs, HOME);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.exitCode).toBe(1);
    expect(result.error.stderrMessage).toContain("registry error:");
  });

  test("a valid registry loads its workspace entries", async () => {
    const fs = makeFsMemoryFake();
    const registryPath = expandPath("~/.claude/memory/registry.toml", HOME);
    fs.seedFile(
      registryPath,
      '[[workspace]]\nid = "primary"\nmatch = ["/repo/primary"]\nkb = "/vault"\n' +
        'worklogs = "/vault/_Worklogs"\nexclude = []\nindex_db = "/idx/index.db"\n',
    );
    const result = await loadRegistryForCli(fs, HOME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((w) => w.id)).toEqual(["primary"]);
  });
});
