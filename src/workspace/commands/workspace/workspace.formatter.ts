/**
 * The `memory workspace add|rm|ls` output, as pure `(structured input) =>
 * string` methods. The skills that drive this CLI parse this output
 * verbatim, so it doubles as a contract; agent-visible text always comes from
 * here. `WorkspaceCommand` calls `container.stdio.write` once per line these
 * return; nothing here does I/O.
 */
export class WorkspaceFormatter {
  /** The "✓ workspace added" line plus 4 indented detail lines. `match` is the
   * ABSOLUTE (not yet tildified) paths, printed before the caller tildifies
   * them for storage. */
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

  /** `noteCount` is a string because it renders as `"?"` when the index can't
   * be read. */
  workspaceLsRow(id: string, kb: string, noteCount: string): string {
    return `• ${id.padEnd(12)} ${kb}  [${noteCount} notes]`;
  }

  workspaceLsMatch(match: readonly string[]): string {
    return `  match: ${match.join(", ")}`;
  }
}
