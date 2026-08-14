import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { RegistryTomlSerializer } from "@/workspace/serializers/registryToml/index.ts";
import { RegistryService } from "@/workspace/services/registry/index.ts";
import { WorkspaceResolverService } from "@/workspace/services/resolver/index.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/workspace/targetResolution/targetResolution.constants.ts";
import { TargetResolutionService } from "@/workspace/targetResolution/targetResolution.service.ts";

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

function makeTargetResolutionService(fs = makeFsMemoryFake()) {
  const registryService = new RegistryService(fs, new RegistryTomlSerializer());
  const resolverService = new WorkspaceResolverService(registryService, makeGitFake());
  return { fs, service: new TargetResolutionService(registryService, resolverService) };
}

describe("TargetResolutionService.resolveTargetWorkspaces (reindex/commit)", () => {
  test("id === null resolves every registered workspace, expanded, in registry order", () => {
    const { service } = makeTargetResolutionService();
    const result = service.resolveTargetWorkspaces(RAWS, HOME, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((ws) => ws.id)).toEqual(["primary", "secondary"]);
  });

  test("a known id resolves to exactly that one workspace", () => {
    const { service } = makeTargetResolutionService();
    const result = service.resolveTargetWorkspaces(RAWS, HOME, "secondary");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((ws) => ws.id)).toEqual(["secondary"]);
  });

  test("an unknown id fails with the exact 'no such workspace' message", () => {
    const { service } = makeTargetResolutionService();
    const result = service.resolveTargetWorkspaces(RAWS, HOME, "ghost");
    expect(result).toEqual({ ok: false, error: "no such workspace: ghost" });
  });
});

describe("TargetResolutionService.resolveWorkspaceForCwd (search/notes)", () => {
  test("an explicit --workspace id wins even when cwd would resolve elsewhere", () => {
    const { service } = makeTargetResolutionService();
    const cwd = expandPath("/repo/primary/wt1", HOME);
    const result = service.resolveWorkspaceForCwd(RAWS, HOME, cwd, "secondary");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("secondary");
  });

  test("an unknown --workspace id fails with the exact 'no such workspace' message", () => {
    const { service } = makeTargetResolutionService();
    const cwd = expandPath("/repo/primary", HOME);
    const result = service.resolveWorkspaceForCwd(RAWS, HOME, cwd, "ghost");
    expect(result).toEqual({ ok: false, error: "no such workspace: ghost" });
  });

  test("no --workspace falls back to cwd resolution (longest-prefix match)", () => {
    const { service } = makeTargetResolutionService();
    const cwd = expandPath("/repo/secondary/wt1", HOME);
    const result = service.resolveWorkspaceForCwd(RAWS, HOME, cwd, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("secondary");
  });

  test("a cwd under no workspace fails with the exact 'no workspace for cwd' message", () => {
    const { service } = makeTargetResolutionService();
    const cwd = expandPath("/elsewhere", HOME);
    const result = service.resolveWorkspaceForCwd(RAWS, HOME, cwd, null);
    expect(result).toEqual({ ok: false, error: NO_WORKSPACE_FOR_CWD_MESSAGE });
  });
});

describe("TargetResolutionService.noSuchWorkspaceMessage", () => {
  test("shared by both resolvers verbatim", () => {
    const { service } = makeTargetResolutionService();
    expect(service.noSuchWorkspaceMessage("x")).toBe("no such workspace: x");
  });
});

describe("TargetResolutionService.loadRegistryForCli", () => {
  test("a missing registry file loads as an empty list, not a failure", async () => {
    const { service } = makeTargetResolutionService();
    const result = await service.loadRegistryForCli(HOME);
    expect(result).toEqual({ ok: true, value: [] });
  });

  test("a present-but-malformed registry maps to a CliOutcome failure", async () => {
    const { fs, service } = makeTargetResolutionService();
    const registryPath = expandPath("~/.claude/memory/registry.toml", HOME);
    fs.seedFile(registryPath, "this is not valid toml [[[");
    const result = await service.loadRegistryForCli(HOME);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.exitCode).toBe(1);
    expect(result.error.stderrMessage).toContain("registry error:");
  });

  test("a valid registry loads its workspace entries", async () => {
    const { fs, service } = makeTargetResolutionService();
    const registryPath = expandPath("~/.claude/memory/registry.toml", HOME);
    fs.seedFile(
      registryPath,
      '[[workspace]]\nid = "primary"\nmatch = ["/repo/primary"]\nkb = "/vault"\n' +
        'worklogs = "/vault/_Worklogs"\nexclude = []\nindex_db = "/idx/index.db"\n',
    );
    const result = await service.loadRegistryForCli(HOME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((w) => w.id)).toEqual(["primary"]);
  });
});
