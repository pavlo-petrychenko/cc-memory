/**
 * The `memory resolve` output, as pure `(structured input) => string`
 * methods. The skills that drive this CLI parse this output verbatim, so it
 * doubles as a contract; agent-visible text always comes from here.
 * `ResolveCommand` calls `container.stdio.write` once per line these return;
 * nothing here does I/O.
 */
export class ResolveFormatter {
  /** NOT a failure path — `resolve` with no workspace for `cwd` still exits 0,
   * this is a plain informational line. */
  noWorkspaceForCwd(cwd: string): string {
    return `no workspace for ${cwd}`;
  }

  /** The 5 `workspace:`/`slug:`/`kb:`/`worklogs:`/`index_db:` lines, each key
   * padded with spaces so the values line up in a fixed column. */
  resolveLines(
    id: string,
    slug: string,
    kb: string,
    worklogs: string,
    indexDb: string,
  ): readonly string[] {
    return [
      `workspace: ${id}`,
      `slug:      ${slug}`,
      `kb:        ${kb}`,
      `worklogs:  ${worklogs}`,
      `index_db:  ${indexDb}`,
    ];
  }
}
