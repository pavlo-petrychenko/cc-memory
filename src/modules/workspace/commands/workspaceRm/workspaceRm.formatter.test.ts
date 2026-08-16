import { describe, expect, test } from "bun:test";

import { WorkspaceRmFormatter } from "@/modules/workspace/commands/workspaceRm/workspaceRm.formatter.ts";

/**
 * Exact-output assertions. These strings are the CLI's contract: the skills parse
 * `memory workspace rm` output, so a changed space is a breaking change.
 */
describe("WorkspaceRmFormatter", () => {
  const formatter = new WorkspaceRmFormatter();

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
});
