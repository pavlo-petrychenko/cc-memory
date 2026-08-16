/** The `memory workspace add` output. The skills that drive this CLI parse it
 * verbatim, so it doubles as a contract. */
export class WorkspaceAddFormatter {
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
}
