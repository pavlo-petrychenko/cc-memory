/** The `memory workspace rm` output. The skills that drive this CLI parse it
 * verbatim, so it doubles as a contract. */
export class WorkspaceRmFormatter {
  workspaceRemovedPurged(id: string): string {
    return `✓ workspace '${id}' removed (index purged; vault left intact)`;
  }

  workspaceUnregistered(id: string): string {
    return `✓ workspace '${id}' unregistered (data left intact)`;
  }
}
