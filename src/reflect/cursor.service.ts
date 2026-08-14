import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import { proposalsDir } from "../worklog/worklog.service.ts";

/**
 * The reflector's due-check and candidate-gathering cursors. Two separate
 * timestamps rather than one: `lastRun` drives `--if-due` and advances on
 * every completed invocation; `lastConsolidated` drives `gather`'s `since`
 * window and advances ONLY when candidates were actually durably recorded
 * somewhere a human can act on them — a headless proposals file, or a
 * previous brief observed fully marked `[x]`/`[~]`. If both cursors advanced
 * together on every spawn, an unattended tmux session that merely handed off
 * a brief (without anyone reviewing it) would silently drop every candidate
 * in it the next time `gather` runs; keeping them separate means such a
 * session re-offers the same candidates tomorrow instead.
 */

const LEGACY_CURSOR_FILENAME = ".last-reflect"; // pre-split single timestamp, in SECONDS
const LAST_RUN_FILENAME = ".reflect-last-run";
const LAST_CONSOLIDATED_FILENAME = ".reflect-last-consolidated";
const MS_PER_HOUR = 3_600_000;
const SECONDS_PER_MS = 1000;

const CANDIDATES_HEADING = "## Candidates"; // matches renderBrief's own heading
const HEADING_PREFIX = "## ";
const CHECKED_CANDIDATE_LINE = /^-\s*\[[xX~]\]\s/;
const BRIEF_FILENAME_PREFIX = "_brief-";
const MARKDOWN_EXTENSION = ".md";

/** The parent directory of an already-absolute, normalized `AbsPath` — the
 * same reasoning `retrieval/db.ts`'s identical private helper documents;
 * duplicated rather than imported since that one isn't exported. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an already-absolute, already-normalized `AbsPath` at a
  // `/` boundary can only yield another absolute, normalized path (or the
  // root `/`).
  return sliced as AbsPath;
}

function cursorPath(workspace: Workspace, filename: string): AbsPath {
  // SAFETY: `parentDirectory(...)` is already an absolute, normalized
  // `AbsPath`; appending a fixed literal filename keeps it that way.
  return `${parentDirectory(workspace.indexDb)}/${filename}` as AbsPath;
}

async function readTimestampFile(fs: FileSystem, path: AbsPath): Promise<number | null> {
  if (!(await fs.exists(path))) return null;
  try {
    const parsed = Number.parseFloat((await fs.readFile(path)).trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeTimestampFile(
  fs: FileSystem,
  path: AbsPath,
  valueMs: number,
): Promise<void> {
  await fs.mkdir(parentDirectory(path));
  await fs.writeFile(path, String(valueMs));
}

/** The legacy cursor's value, converted from seconds to this codebase's
 * millisecond convention (`Clock.nowMs`). */
async function readLegacyCursorMs(
  fs: FileSystem,
  workspace: Workspace,
): Promise<number | null> {
  const seconds = await readTimestampFile(
    fs,
    cursorPath(workspace, LEGACY_CURSOR_FILENAME),
  );
  return seconds === null ? null : seconds * SECONDS_PER_MS;
}

/**
 * One-time migration off the single `.last-reflect` timestamp: if neither new
 * cursor has been written yet but a legacy install left one, seed BOTH
 * `lastRun` and `lastConsolidated` from it, so the first run under the split
 * cursors behaves exactly like the last run under the single cursor would
 * have. A no-op on a genuinely fresh workspace (no legacy file) or one
 * already migrated (either new file present).
 */
export async function migrateLegacyCursor(
  fs: FileSystem,
  workspace: Workspace,
): Promise<void> {
  const alreadyMigrated =
    (await fs.exists(cursorPath(workspace, LAST_RUN_FILENAME))) ||
    (await fs.exists(cursorPath(workspace, LAST_CONSOLIDATED_FILENAME)));
  if (alreadyMigrated) return;
  const legacyMs = await readLegacyCursorMs(fs, workspace);
  if (legacyMs === null) return;
  await writeTimestampFile(fs, cursorPath(workspace, LAST_RUN_FILENAME), legacyMs);
  await writeTimestampFile(
    fs,
    cursorPath(workspace, LAST_CONSOLIDATED_FILENAME),
    legacyMs,
  );
}

/** Due when there's no `lastRun` cursor yet, or the elapsed time since it is
 * at least `thresholdHours`. */
export async function isDue(
  fs: FileSystem,
  workspace: Workspace,
  nowMs: number,
  thresholdHours: number,
): Promise<boolean> {
  const lastRunMs = await readTimestampFile(fs, cursorPath(workspace, LAST_RUN_FILENAME));
  if (lastRunMs === null) return true;
  return nowMs - lastRunMs >= thresholdHours * MS_PER_HOUR;
}

/** Advances on every completed run, regardless of whether candidates were
 * durably recorded — a fresh tmux spawn stamps only this, never
 * `lastConsolidated`. */
export async function stampLastRun(
  fs: FileSystem,
  workspace: Workspace,
  nowMs: number,
): Promise<void> {
  await writeTimestampFile(fs, cursorPath(workspace, LAST_RUN_FILENAME), nowMs);
}

/** `gather`'s `since`: `null` (the caller's `0`, "everything") when no
 * candidates have ever been consolidated yet. */
export async function readLastConsolidatedMs(
  fs: FileSystem,
  workspace: Workspace,
): Promise<number | null> {
  return readTimestampFile(fs, cursorPath(workspace, LAST_CONSOLIDATED_FILENAME));
}

/** Advances only when candidates were actually durably recorded somewhere a
 * human can act on them — see the module doc comment. */
export async function stampLastConsolidated(
  fs: FileSystem,
  workspace: Workspace,
  nowMs: number,
): Promise<void> {
  await writeTimestampFile(fs, cursorPath(workspace, LAST_CONSOLIDATED_FILENAME), nowMs);
}

/**
 * Whether every candidate bullet in a brief (`renderBrief`,
 * `proposals.renderer.ts`) has been marked done by hand: `[x]` (applied) or
 * `[~]` (rejected) — the same two markers the proposals file uses, adopted
 * here as the signal that an unattended interactive session was in fact
 * attended and worked through. `renderBrief`'s own bullets carry no
 * checkbox — an untouched brief is therefore always "unprocessed"; only
 * manual editing can make this true.
 */
export function isBriefFullyProcessed(briefContent: string): boolean {
  const lines = briefContent.split("\n");
  const candidatesHeadingIndex = lines.indexOf(CANDIDATES_HEADING);
  if (candidatesHeadingIndex === -1) return false;

  const candidateLines: string[] = [];
  for (let index = candidatesHeadingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.startsWith(HEADING_PREFIX)) break;
    if (line.trim() === "") continue;
    candidateLines.push(line);
  }
  return (
    candidateLines.length > 0 &&
    candidateLines.every((line) => CHECKED_CANDIDATE_LINE.test(line))
  );
}

async function mostRecentBriefPath(
  fs: FileSystem,
  workspace: Workspace,
): Promise<AbsPath | null> {
  const dir = proposalsDir(workspace);
  let names: readonly string[];
  try {
    names = await fs.readDir(dir);
  } catch {
    return null;
  }
  const briefNames = names
    .filter(
      (name) =>
        name.startsWith(BRIEF_FILENAME_PREFIX) && name.endsWith(MARKDOWN_EXTENSION),
    )
    .toSorted();
  const latest = briefNames.at(-1);
  // SAFETY: `dir` is an already-absolute `AbsPath`; `latest` is one entry
  // `readDir` returned for it.
  return latest === undefined ? null : (`${dir}/${latest}` as AbsPath);
}

/** The most recently written brief, if it exists and every one of its
 * candidates has been marked processed — see `isBriefFullyProcessed`. */
export async function isPreviousBriefProcessed(
  fs: FileSystem,
  workspace: Workspace,
): Promise<boolean> {
  const path = await mostRecentBriefPath(fs, workspace);
  if (path === null) return false;
  try {
    return isBriefFullyProcessed(await fs.readFile(path));
  } catch {
    return false;
  }
}
