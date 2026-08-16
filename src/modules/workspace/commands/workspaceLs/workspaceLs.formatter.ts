/** The `memory workspace ls` output. The skills that drive this CLI parse it
 * verbatim, so it doubles as a contract. */
export class WorkspaceLsFormatter {
  workspaceLsRow(id: string, kb: string, noteCount: string): string {
    return `• ${id.padEnd(12)} ${kb}  [${noteCount} notes]`;
  }

  workspaceLsMatch(match: readonly string[]): string {
    return `  match: ${match.join(", ")}`;
  }
}
