import { describe, expect, test } from "bun:test";

import { ResolveFormatter } from "@/modules/workspace/commands/resolve/resolve.formatter.ts";

/**
 * Exact-output assertions: the `memory resolve` block is parsed by the remember,
 * save-learning and actualize-kb skills, which read the labelled fields by name.
 */
describe("ResolveFormatter", () => {
  const formatter = new ResolveFormatter();

  test("noWorkspaceForCwd", () => {
    expect(formatter.noWorkspaceForCwd("/outside")).toBe("no workspace for /outside");
  });

  test("resolveLines", () => {
    expect(
      formatter.resolveLines("primary", "wt1", "/kb", "/kb/_Worklogs", "/idx/index.db"),
    ).toEqual([
      "workspace: primary",
      "slug:      wt1",
      "kb:        /kb",
      "worklogs:  /kb/_Worklogs",
      "index_db:  /idx/index.db",
    ]);
  });
});
