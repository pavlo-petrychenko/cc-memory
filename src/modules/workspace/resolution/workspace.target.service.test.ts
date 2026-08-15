import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";
import { TargetResolutionService } from "@/modules/workspace/resolution/workspace.target.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

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

const validator = new WorkspaceValidatorService();
const service = new TargetResolutionService(
  validator,
  new WorkspaceResolverService(validator),
);

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
