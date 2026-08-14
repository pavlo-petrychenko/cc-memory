/**
 * Renders the wrap-gate's two messages — `hooks/wrap-gate.py:97-108`.
 * Agent-visible text (C4): copied verbatim. Which one to emit (nudge vs. block)
 * is a stateful decision (nudge count, marker files) that belongs to the `Stop`
 * hook handler (P7), not here — these are pure `(slug, dirtyCount) => string`.
 */

export type WrapGateInput = {
  readonly slug: string;
  readonly dirtyCount: number;
};

function describeDirtyWork(input: WrapGateInput): string {
  const fileWord = input.dirtyCount === 1 ? "" : "s";
  return `\`${input.slug}\` (${input.dirtyCount} uncommitted file${fileWord})`;
}

/** The non-blocking nudge shown the first time(s) unsaved work is detected. */
export function renderNudge(input: WrapGateInput): string {
  const where = describeDirtyWork(input);
  return (
    `📝 Unsaved work in ${where}. Consider running the \`remember\` skill to ` +
    "update this worktree's worklog (summary of changes + open threads) " +
    "before finishing."
  );
}

/** The hard-block reason once escalation thresholds are met. */
export function renderBlockReason(input: WrapGateInput): string {
  const where = describeDirtyWork(input);
  return (
    `Before you finish: capture this session in working memory for ${where}. ` +
    "Run the `remember` skill — write today's worklog entry with a **summary " +
    "of ALL changes you made**, plus Learned/Decided/Open (tag durable " +
    "findings #promote), and refresh STATE.md. Worklogs need no approval."
  );
}
