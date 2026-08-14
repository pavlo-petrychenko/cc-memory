/**
 * Every `print()` in `bin/memory`, as pure `(structured input) => string`
 * functions — the CLI half of C3 (the six skills parse this output verbatim,
 * per CLAUDE.md's "agent-visible text is a contract" rule) and the
 * "every agent-visible byte comes from a pure renderer" convention
 * ([[architecture]] decision #4). Commands call `container.stdio.write` once
 * per line these return; nothing here does I/O.
 *
 * Python's `str.format` field widths (`:12`, `:>2`, `:5`) are string
 * left-justify/right-justify padding — `padEnd`/`padStart` reproduce them
 * exactly, including "no truncation when the value is already wider than the
 * field" (both Python and JS agree on that).
 */

/** `f"✓ workspace '{ws_id}' added"` + the 4 indented detail lines
 * (`bin/memory:64-68`). `match` is the ABSOLUTE (not yet tildified) paths —
 * `new["match"]`, printed before `cmd_workspace_add` tildifies for storage. */
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

/** `bin/memory:84`. */
export function formatWorkspaceRemovedPurged(id: string): string {
  return `✓ workspace '${id}' removed (index purged; vault left intact)`;
}

/** `bin/memory:86`. */
export function formatWorkspaceUnregistered(id: string): string {
  return `✓ workspace '${id}' unregistered (data left intact)`;
}

/** `bin/memory:92`. */
export const NO_WORKSPACES_MESSAGE = "(no workspaces)";

/** `f"• {w['id']:12} {ws['kb']}  [{n} notes]"` (`bin/memory:104`). `noteCount`
 * is a string because Python's `n` is `"?"` when the index can't be read. */
export function formatWorkspaceLsRow(id: string, kb: string, noteCount: string): string {
  return `• ${id.padEnd(12)} ${kb}  [${noteCount} notes]`;
}

/** `f"  match: {', '.join(ws['match'])}"` (`bin/memory:105`). */
export function formatWorkspaceLsMatch(match: readonly string[]): string {
  return `  match: ${match.join(", ")}`;
}

/** `f"no workspace for {cwd}"` (`bin/memory:114`) — NOT a `sys.exit`, a plain
 * `print` + return: `resolve` with no workspace still exits 0. */
export function formatNoWorkspaceForCwd(cwd: string): string {
  return `no workspace for ${cwd}`;
}

/** The 5 `workspace:`/`slug:`/`kb:`/`worklogs:`/`index_db:` lines
 * (`bin/memory:116-120`) — each key padded with spaces (not a computed field
 * width; transcribed literally) so the values line up in a fixed column. */
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

/** `f"{ws['id']}: +{a} ~{u} -{r} = {t} notes"` (`bin/memory:135-136`). */
export function formatReindexLine(
  id: string,
  added: number,
  updated: number,
  removed: number,
  total: number,
): string {
  return `${id}: +${added} ~${updated} -${removed} = ${total} notes`;
}

/** `bin/memory:148`. */
export const NO_HITS_MESSAGE = "(no hits)";

/** `f"• {h['title']}  ({rel})\n  {h['snippet']}"` (`bin/memory:152`) — two
 * lines: the bullet, then the snippet indented by two spaces. */
export function formatSearchHit(
  title: string,
  relativePath: string,
  snippet: string,
): readonly string[] {
  return [`• ${title}  (${relativePath})`, `  ${snippet}`];
}

/** `"(no notes)" + (f" under {a.folder}" if a.folder else "")` (`bin/memory:172`).
 * Python's `if a.folder` is falsy for both `None` and `""` — `folder` here is
 * `string | null`, and an empty string is treated the same as `null` by the
 * caller before this is reached, matching that. */
export function formatNoNotes(folder: string | null): string {
  return folder === null ? "(no notes)" : `(no notes) under ${folder}`;
}

/** `f"[{imp:>2}] {(r['type'] or 'note'):5}  {r['path']}  — {r['title']}"`
 * (`bin/memory:176`). `importance` is `null` for Python's `None`, rendered as
 * `"-"` before the right-justify padding is applied (matching `imp:>2`
 * operating on the already-stringified `"-"`, not on `None` itself). */
export function formatNoteLine(
  importance: number | null,
  type: string,
  path: string,
  title: string,
): string {
  const importanceText = importance === null ? "-" : String(importance);
  const typeText = type === "" ? "note" : type; // `r['type'] or 'note'` — falsy, not just None
  return `[${importanceText.padStart(2)}] ${typeText.padEnd(5)}  ${path}  — ${title}`;
}

/** `f"{ws['id']}: not a git repo, skipping"` (`bin/memory:185`). */
export function formatCommitSkipped(id: string): string {
  return `${id}: not a git repo, skipping`;
}

/** `f"{ws['id']}: {'committed' if r.returncode == 0 else 'nothing to commit'}"`
 * (`bin/memory:190`). */
export function formatCommitResult(id: string, committed: boolean): string {
  return `${id}: ${committed ? "committed" : "nothing to commit"}`;
}

/** `print("registry:", registry.REGISTRY_PATH, "(ok)"/"(empty)")`
 * (`bin/memory:214`) — Python's multi-arg `print` joins with a single space. */
export function formatRegistryStatus(registryPath: string, status: string): string {
  return `registry: ${registryPath} ${status}`;
}

/** `f"cwd {cwd} -> {ws['id'] if ws else 'no workspace'}"` (`bin/memory:217`). */
export function formatCwdResolution(
  cwd: string,
  resolvedIdOrNoWorkspace: string,
): string {
  return `cwd ${cwd} -> ${resolvedIdOrNoWorkspace}`;
}

/** Not present in Python (P7's hooks don't exist yet) — the doctor stub's
 * honest per-hook line, one per name, in place of `bin/memory:230-242`'s real
 * exit-code/output report. Never claims a hook ran. */
export function formatHookNotImplemented(name: string): string {
  return `  ${name}: (not implemented yet)`;
}

/** The reflect stub's honest per-workspace line — never claims a consolidation
 * ran (P8 owns `gather_candidates`/the LLM decision/tmux spawn). */
export function formatReflectNotImplemented(id: string): string {
  return `${id}: reflect not implemented yet (P8)`;
}
