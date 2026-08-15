/** The `memory workspace add|rm|ls` output. The skills that drive this CLI parse
 * it verbatim, so it doubles as a contract. */
export class WorkspaceFormatter {
  workspaceAdded(
    id: string,
    kb: string,
    worklogs: string,
    indexDb: string,
    totalNotes: number,
    match: readonly string[],
  ): readonly string[] {
    return [
      `✓ workspace '${id}' added`,
      `  kb       ${kb}`,
      `  worklogs ${worklogs}`,
      `  index_db ${indexDb}  (${totalNotes} notes)`,
      `  match    ${match.join(", ")}`,
    ];
  }

  workspaceRemovedPurged(id: string): string {
    return `✓ workspace '${id}' removed (index purged; vault left intact)`;
  }

  workspaceUnregistered(id: string): string {
    return `✓ workspace '${id}' unregistered (data left intact)`;
  }

  workspaceLsRow(id: string, kb: string, noteCount: string): string {
    return `• ${id.padEnd(12)} ${kb}  [${noteCount} notes]`;
  }

  workspaceLsMatch(match: readonly string[]): string {
    return `  match: ${match.join(", ")}`;
  }
}
