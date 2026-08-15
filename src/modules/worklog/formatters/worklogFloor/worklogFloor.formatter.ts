import type { FloorBlockInput } from "@/modules/worklog/formatters/worklogFloor/worklogFloor.typedefs.ts";

/** Renders the `SessionEnd` HTML-comment skeleton a killed session still leaves
 * behind. Agent-visible text — must stay exact. */
export class WorklogFloorFormatter {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  format(input: FloorBlockInput): string {
    const lines = [
      `<!-- auto (SessionEnd ${input.date}, reason=${input.reason || "n/a"}) -->`,
    ];
    if (input.branch !== "") lines.push(`<!-- branch: ${input.branch} -->`);
    if (input.uncommitted !== "")
      lines.push(`<!-- uncommitted: ${input.uncommitted} -->`);
    if (input.commits !== "") {
      lines.push("<!-- recent commits:");
      for (const line of input.commits.split(/\r\n|\r|\n/)) lines.push(`  ${line}`);
      lines.push("-->");
    }
    if (lines.length === 1) lines.push("<!-- no git activity detected -->");
    return lines.join("\n");
  }
}
