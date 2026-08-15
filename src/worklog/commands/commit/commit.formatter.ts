/**
 * The `memory commit` output, as pure `(structured input) => string`
 * methods. The skills that drive this CLI parse this output verbatim, so it
 * doubles as a contract; agent-visible text always comes from here.
 * `CommitCommand` calls `container.stdio.write` once per line these return;
 * nothing here does I/O.
 */
export class CommitFormatter {
  commitSkipped(id: string): string {
    return `${id}: not a git repo, skipping`;
  }

  commitResult(id: string, committed: boolean): string {
    return `${id}: ${committed ? "committed" : "nothing to commit"}`;
  }
}
