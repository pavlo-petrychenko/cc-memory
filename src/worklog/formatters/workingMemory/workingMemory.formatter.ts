import type { WorkingMemoryInput } from "@/worklog/formatters/workingMemory/workingMemory.typedefs.ts";

/** Renders the working-memory block injected at SessionStart. Agent-visible text —
 * must stay exact, including both "no working memory yet" phrasings. */
export class WorkingMemoryFormatter {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  format(input: WorkingMemoryInput): string {
    const head = `# Working memory — workspace \`${input.workspaceId}\`, worktree \`${input.slug}\``;
    if (input.state !== null) {
      return `${head}\n\n${input.state.trim()}\n\n_(Update this at wrap with the \`remember\` skill.)_`;
    }
    return (
      `${head}\n\n_No working memory yet for this worktree._ Start one with ` +
      "the `remember` skill (it writes `STATE.md` + a dated journal entry)."
    );
  }
}
