/**
 * Renders the working-memory block injected at SessionStart —
 * `session-start.build_working_memory` (`hooks/session-start.py:101-108`).
 * Agent-visible text (C4): copied verbatim, including both "no working memory
 * yet" phrasings.
 */

export type WorkingMemoryInput = {
  readonly workspaceId: string;
  readonly slug: string;
  /** `STATE.md`'s raw content, or `null` when the worktree has none yet
   * (`worklog.read_state` returns `None` on a missing/unreadable file). */
  readonly state: string | null;
};

export function renderWorkingMemory(input: WorkingMemoryInput): string {
  const head = `# Working memory — workspace \`${input.workspaceId}\`, worktree \`${input.slug}\``;
  if (input.state !== null) {
    return `${head}\n\n${input.state.trim()}\n\n_(Update this at wrap with the \`remember\` skill.)_`;
  }
  return (
    `${head}\n\n_No working memory yet for this worktree._ Start one with ` +
    "the `remember` skill (it writes `STATE.md` + a dated journal entry)."
  );
}
