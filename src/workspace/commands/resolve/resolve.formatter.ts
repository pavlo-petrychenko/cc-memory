/** The `memory resolve` output; the skills parse it verbatim, so it's a contract. */
export class ResolveFormatter {
  /** NOT a failure path — `resolve` with no workspace for `cwd` still exits 0. */
  noWorkspaceForCwd(cwd: string): string {
    return `no workspace for ${cwd}`;
  }

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
