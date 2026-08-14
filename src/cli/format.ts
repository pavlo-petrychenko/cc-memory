/**
 * Every command's output, as pure `(structured input) => string` functions.
 * The skills that drive this CLI parse this output verbatim, so it doubles as
 * a contract; agent-visible text always comes from a pure renderer here.
 * Commands call `container.stdio.write` once per line these return; nothing
 * here does I/O.
 *
 * Field widths use `padEnd`/`padStart` for left/right-justify padding,
 * including "no truncation when the value is already wider than the field".
 */

/** The "✓ workspace added" line plus 4 indented detail lines. `match` is the
 * ABSOLUTE (not yet tildified) paths, printed before the caller tildifies
 * them for storage. */
export function formatWorkspaceAdded(
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

export function formatWorkspaceRemovedPurged(id: string): string {
  return `✓ workspace '${id}' removed (index purged; vault left intact)`;
}

export function formatWorkspaceUnregistered(id: string): string {
  return `✓ workspace '${id}' unregistered (data left intact)`;
}

export const NO_WORKSPACES_MESSAGE = "(no workspaces)";

/** `noteCount` is a string because it renders as `"?"` when the index can't
 * be read. */
export function formatWorkspaceLsRow(id: string, kb: string, noteCount: string): string {
  return `• ${id.padEnd(12)} ${kb}  [${noteCount} notes]`;
}

export function formatWorkspaceLsMatch(match: readonly string[]): string {
  return `  match: ${match.join(", ")}`;
}

/** NOT a failure path — `resolve` with no workspace for `cwd` still exits 0,
 * this is a plain informational line. */
export function formatNoWorkspaceForCwd(cwd: string): string {
  return `no workspace for ${cwd}`;
}

/** The 5 `workspace:`/`slug:`/`kb:`/`worklogs:`/`index_db:` lines, each key
 * padded with spaces so the values line up in a fixed column. */
export function formatResolveLines(
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

export function formatReindexLine(
  id: string,
  added: number,
  updated: number,
  removed: number,
  total: number,
): string {
  return `${id}: +${added} ~${updated} -${removed} = ${total} notes`;
}

export const NO_HITS_MESSAGE = "(no hits)";

/** Two lines: the bullet, then the snippet indented by two spaces. */
export function formatSearchHit(
  title: string,
  relativePath: string,
  snippet: string,
): readonly string[] {
  return [`• ${title}  (${relativePath})`, `  ${snippet}`];
}

/** An explicit empty string is treated the same as `null` (no folder). */
export function formatNoNotes(folder: string | null): string {
  return folder === null ? "(no notes)" : `(no notes) under ${folder}`;
}

/** `importance` renders as `"-"` when absent, before the right-justify
 * padding is applied. */
export function formatNoteLine(
  importance: number | null,
  type: string,
  path: string,
  title: string,
): string {
  const importanceText = importance === null ? "-" : String(importance);
  const typeText = type === "" ? "note" : type;
  return `[${importanceText.padStart(2)}] ${typeText.padEnd(5)}  ${path}  — ${title}`;
}

export function formatCommitSkipped(id: string): string {
  return `${id}: not a git repo, skipping`;
}

export function formatCommitResult(id: string, committed: boolean): string {
  return `${id}: ${committed ? "committed" : "nothing to commit"}`;
}

export function formatRegistryStatus(registryPath: string, status: string): string {
  return `registry: ${registryPath} ${status}`;
}

export function formatCwdResolution(
  cwd: string,
  resolvedIdOrNoWorkspace: string,
): string {
  return `cwd ${cwd} -> ${resolvedIdOrNoWorkspace}`;
}

/** The doctor stub's honest per-hook line, one per name — never claims a hook
 * ran. */
export function formatHookNotImplemented(name: string): string {
  return `  ${name}: (not implemented yet)`;
}

/** The reflect stub's honest per-workspace line — never claims a
 * consolidation ran. */
export function formatReflectNotImplemented(id: string): string {
  return `${id}: reflect not implemented yet (P8)`;
}
