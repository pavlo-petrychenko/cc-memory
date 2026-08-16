import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/modules/workspace/workspace.constants.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";

const HOME = absPath("/home/test");

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

const RAWS: readonly RawWorkspace[] = [
  raw("primary", "/repo/primary"),
  raw("secondary", "/repo/secondary"),
];

const service = makeWorkspaceContext(
  makeFsMemoryFake(),
  makeGitFake(),
  makeProcFake(),
).targetResolutionService;

describe("TargetResolutionService", () => {
  test("id === null resolves every registered workspace in registry order", () => {
    const result = service.resolveTargetWorkspaces(RAWS, HOME, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((ws) => ws.id)).toEqual(["primary", "secondary"]);
  });

  test("an unknown id fails with the exact 'no such workspace' message", () => {
    expect(service.resolveTargetWorkspaces(RAWS, HOME, "ghost")).toEqual({
      ok: false,
      error: "no such workspace: ghost",
    });
  });

  test("resolveWorkspaceForCwd falls back to longest-prefix cwd match", () => {
    const result = service.resolveWorkspaceForCwd(
      RAWS,
      HOME,
      absPath("/repo/secondary/wt1"),
      null,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("secondary");
  });

  test("a cwd under no workspace fails with the exact message", () => {
    expect(
      service.resolveWorkspaceForCwd(RAWS, HOME, absPath("/elsewhere"), null),
    ).toEqual({
      ok: false,
      error: NO_WORKSPACE_FOR_CWD_MESSAGE,
    });
  });
});
