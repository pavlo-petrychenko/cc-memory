/**
 * Renders the `SessionEnd` deterministic worklog-floor skeleton: the exact
 * HTML-comment skeleton a killed session still leaves behind. This text is
 * agent-visible and must stay exact.
 */

export type FloorBlockInput = {
  readonly date: string;
  readonly reason: string;
  readonly branch: string;
  /** The last line of `git diff --stat`/`git diff --cached --stat` (whichever is
   * non-empty), already extracted by the caller; `""` when neither has output. */
  readonly uncommitted: string;
  /** Raw `git log -5 --oneline` output (already `.strip()`'d); `""` when empty. */
  readonly commits: string;
};

export function renderFloorBlock(input: FloorBlockInput): string {
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
