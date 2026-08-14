import type { WrapGateInput } from "@/session/hooks/wrapGate/wrapGate.typedefs.ts";

/**
 * Renders the wrap-gate's two messages. Which one to emit (nudge vs. block)
 * is a stateful decision (nudge count, prior state) that belongs to the
 * `Stop` hook handler, not here — these are pure `(slug, dirtyCount) => string`.
 */
export class WrapGateFormatter {
  private describeDirtyWork(input: WrapGateInput): string {
    const fileWord = input.dirtyCount === 1 ? "" : "s";
    return `\`${input.slug}\` (${input.dirtyCount} uncommitted file${fileWord})`;
  }

  /** The non-blocking nudge shown the first time(s) unsaved work is detected. */
  formatNudge(input: WrapGateInput): string {
    const where = this.describeDirtyWork(input);
    return (
      `📝 Unsaved work in ${where}. Consider running the \`remember\` skill to ` +
      "update this worktree's worklog (summary of changes + open threads) " +
      "before finishing."
    );
  }

  /** The hard-block reason once escalation thresholds are met. */
  formatBlockReason(input: WrapGateInput): string {
    const where = this.describeDirtyWork(input);
    return (
      `Before you finish: capture this session in working memory for ${where}. ` +
      "Run the `remember` skill — write today's worklog entry with a **summary " +
      "of ALL changes you made**, plus Learned/Decided/Open (tag durable " +
      "findings #promote), and refresh STATE.md. Worklogs need no approval."
    );
  }
}
