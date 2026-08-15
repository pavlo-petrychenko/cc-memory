import type { WrapGateInput } from "@/session/hooks/wrapGate/wrapGate.typedefs.ts";

/** Renders the wrap-gate's two messages. Which one to emit is a stateful decision
 * that belongs to the `Stop` hook handler, not here. */
export class WrapGateFormatter {
  private describeDirtyWork(input: WrapGateInput): string {
    const fileWord = input.dirtyCount === 1 ? "" : "s";
    return `\`${input.slug}\` (${input.dirtyCount} uncommitted file${fileWord})`;
  }

  formatNudge(input: WrapGateInput): string {
    const where = this.describeDirtyWork(input);
    return (
      `📝 Unsaved work in ${where}. Consider running the \`remember\` skill to ` +
      "update this worktree's worklog (summary of changes + open threads) " +
      "before finishing."
    );
  }

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
