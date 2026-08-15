import { describe, expect, test } from "bun:test";

import { WorkspaceAddFormatter } from "@/modules/workspace/commands/workspaceAdd/workspaceAdd.formatter.ts";

/**
 * Exact-output assertions. These strings are the CLI's contract: the skills parse
 * `memory workspace add` output, so a changed space or field width is a breaking
 * change, not cosmetics.
 */
describe("WorkspaceAddFormatter", () => {
  const formatter = new WorkspaceAddFormatter();

  test("workspaceAdded", () => {
    expect(
      formatter.workspaceAdded(
        "acme",
        "/vault",
        "/vault/_Worklogs",
        "/idx/index.db",
        12,
        ["/repo/a", "/repo/b"],
      ),
    ).toEqual([
      "✓ workspace 'acme' added",
      "  kb       /vault",
      "  worklogs /vault/_Worklogs",
      "  index_db /idx/index.db  (12 notes)",
      "  match    /repo/a, /repo/b",
    ]);
  });
});
