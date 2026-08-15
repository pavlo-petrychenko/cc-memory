import { describe, expect, test } from "bun:test";

import { WorkspaceFormatter } from "@/modules/workspace/commands/workspace/workspace.formatter.ts";
import { NO_WORKSPACES_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

/**
 * Exact-output assertions. These strings are the CLI's contract: the skills parse
 * `memory workspace ls` and `memory workspace add` output, so a changed space or a
 * changed field width is a breaking change, not cosmetics.
 */
describe("WorkspaceFormatter", () => {
  const formatter = new WorkspaceFormatter();

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

  test("workspaceRemovedPurged", () => {
    expect(formatter.workspaceRemovedPurged("acme")).toBe(
      "✓ workspace 'acme' removed (index purged; vault left intact)",
    );
  });

  test("workspaceUnregistered", () => {
    expect(formatter.workspaceUnregistered("acme")).toBe(
      "✓ workspace 'acme' unregistered (data left intact)",
    );
  });

  test("NO_WORKSPACES_MESSAGE", () => {
    expect(NO_WORKSPACES_MESSAGE).toBe("(no workspaces)");
  });

  test("workspaceLsRow pads the id to width 12", () => {
    expect(formatter.workspaceLsRow("acme", "/vault", "7")).toBe(
      "• acme         /vault  [7 notes]",
    );
    // An id longer than the field is never truncated — the row just gets wider.
    expect(formatter.workspaceLsRow("a-very-long-workspace-id", "/vault", "?")).toBe(
      "• a-very-long-workspace-id /vault  [? notes]",
    );
  });

  test("workspaceLsMatch", () => {
    expect(formatter.workspaceLsMatch(["/repo/a", "/repo/b"])).toBe(
      "  match: /repo/a, /repo/b",
    );
  });
});
