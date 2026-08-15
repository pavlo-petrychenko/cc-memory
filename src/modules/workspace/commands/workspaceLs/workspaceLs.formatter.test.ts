import { describe, expect, test } from "bun:test";

import { WorkspaceLsFormatter } from "@/modules/workspace/commands/workspaceLs/workspaceLs.formatter.ts";
import { NO_WORKSPACES_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

/**
 * Exact-output assertions. These strings are the CLI's contract: the skills parse
 * `memory workspace ls` output, so a changed space or field width is a breaking
 * change, not cosmetics.
 */
describe("WorkspaceLsFormatter", () => {
  const formatter = new WorkspaceLsFormatter();

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
