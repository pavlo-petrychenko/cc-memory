import type { FloorBlockInput } from "@/worklog/formatters/worklogFloor/worklogFloor.typedefs.ts";

/**
 * Renders the `SessionEnd` deterministic worklog-floor skeleton: the exact
 * HTML-comment skeleton a killed session still leaves behind. This text is
 * agent-visible and must stay exact.
 */

export function formatFloorBlock(input: FloorBlockInput): string {
  const lines = [
    `<!-- auto (SessionEnd ${input.date}, reason=${input.reason || "n/a"}) -->`,
  ];
  if (input.branch !== "") lines.push(`<!-- branch: ${input.branch} -->`);
  if (input.uncommitted !== "") lines.push(`<!-- uncommitted: ${input.uncommitted} -->`);
  if (input.commits !== "") {
    lines.push("<!-- recent commits:");
    for (const line of input.commits.split(/\r\n|\r|\n/)) lines.push(`  ${line}`);
    lines.push("-->");
  }
  if (lines.length === 1) lines.push("<!-- no git activity detected -->");
  return lines.join("\n");
}
