/** The `memory commit` output. The skills that drive this CLI parse it verbatim,
 * so it doubles as a contract. */
export class CommitFormatter {
  commitSkipped(id: string): string {
    return `${id}: not a git repo, skipping`;
  }

  commitResult(id: string, committed: boolean): string {
    return `${id}: ${committed ? "committed" : "nothing to commit"}`;
  }
}
