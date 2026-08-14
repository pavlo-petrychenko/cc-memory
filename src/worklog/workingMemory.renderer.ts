/**
 * Renders the working-memory block injected at SessionStart. This text is
 * agent-visible and must stay exact, including both "no working memory yet"
 * phrasings.
 */

export type WorkingMemoryInput = {
  readonly workspaceId: string;
  readonly slug: string;
  /** `STATE.md`'s raw content, or `null` when the worktree has none yet
   * (missing or unreadable file). */
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
