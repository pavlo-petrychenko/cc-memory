import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace, WorktreeSlug } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import type { Git } from "../platform/git.port.ts";

/**
 * Worklog (short-term/episodic memory) paths and I/O (`lib/worklog.py`, whole
 * file). Two files per worktree under `<kb>/_Worklogs/<slug>/`: `STATE.md`
 * (living) and `<date>.md` (append-only journal). The templates themselves
 * (`STATE_TEMPLATE`/`ENTRY_TEMPLATE`) already ported to
 * `domain/worklogFormat.ts`'s `stateTemplate`/`entryTemplate` — this file only
 * owns the filesystem side.
 */

const STATE_FILENAME = "STATE.md";
const MARKDOWN_EXTENSION = ".md";
const PROPOSALS_DIR_NAME = "_proposals";
const DEFAULT_RECENT_ENTRIES_LIMIT = 2; // worklog.py:72

/**
 * Join path segments onto an `AbsPath` base. Every segment used by this file is
 * either a sanitized `WorktreeSlug` (`paths.ts`'s `sanitizeSlug` — already
 * restricted to `[A-Za-z0-9._-]`), a fixed literal (`"STATE.md"`,
 * `"_proposals"`), or a `<date>.md` filename built from a `Clock`-supplied ISO
 * date — never raw user input, never a `.`/`..` segment — so the result is still
 * absolute and normalized.
 */
function joinAbsPath(base: AbsPath, ...segments: readonly string[]): AbsPath {
  const joined = [base, ...segments].join("/");
  // SAFETY: see the doc comment above.
  return joined as AbsPath;
}

/** `worklog.worktree_dir` (`worklog.py:39-40`). */
export function worktreeDir(ws: Workspace, slug: WorktreeSlug): AbsPath {
  return joinAbsPath(ws.worklogs, slug);
}

/** `worklog.state_path` (`worklog.py:43-44`). */
export function statePath(ws: Workspace, slug: WorktreeSlug): AbsPath {
  return joinAbsPath(worktreeDir(ws, slug), STATE_FILENAME);
}

/** `worklog.dated_path` (`worklog.py:47-48`). */
export function datedPath(ws: Workspace, slug: WorktreeSlug, date: string): AbsPath {
  return joinAbsPath(worktreeDir(ws, slug), `${date}${MARKDOWN_EXTENSION}`);
}

/** `worklog.proposals_dir` (`worklog.py:51-52`). */
export function proposalsDir(ws: Workspace): AbsPath {
  return joinAbsPath(ws.worklogs, PROPOSALS_DIR_NAME);
}

/** `worklog.ensure_dir` (`worklog.py:55-58`) — creates (idempotently) and returns it. */
export async function ensureDir(
  fs: FileSystem,
  ws: Workspace,
  slug: WorktreeSlug,
): Promise<AbsPath> {
  const dir = worktreeDir(ws, slug);
  await fs.mkdir(dir);
  return dir;
}

/**
 * `worklog.read_state` (`worklog.py:61-69`): `null` when `STATE.md` doesn't
 * exist, isn't a regular file, or fails to read — the PoC's bare
 * `except Exception: return None` swallows any read failure the same way.
 */
export async function readState(
  fs: FileSystem,
  ws: Workspace,
  slug: WorktreeSlug,
): Promise<string | null> {
  const path = statePath(ws, slug);
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile) return null;
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

export type WorklogEntry = { readonly date: string; readonly text: string };

/**
 * `worklog.recent_entries` (`worklog.py:72-88`): the most recent `limit` dated
 * journal files (`STATE.md` excluded), newest first. A worktree directory that
 * doesn't exist (or isn't a directory) yields `[]`; a file that fails to read is
 * silently skipped, same as the Python's bare `except Exception: pass`.
 */
export async function recentEntries(
  fs: FileSystem,
  ws: Workspace,
  slug: WorktreeSlug,
  limit: number = DEFAULT_RECENT_ENTRIES_LIMIT,
): Promise<readonly WorklogEntry[]> {
  const dir = worktreeDir(ws, slug);
  let names: readonly string[];
  try {
    names = await fs.readDir(dir);
  } catch {
    return [];
  }

  const datedFileNames = names
    .filter((name) => name.endsWith(MARKDOWN_EXTENSION) && name !== STATE_FILENAME)
    .toSorted()
    .toReversed()
    .slice(0, limit);

  const attempts = await Promise.all(
    datedFileNames.map(async (fileName): Promise<WorklogEntry | null> => {
      try {
        const text = await fs.readFile(joinAbsPath(dir, fileName));
        return { date: fileName.slice(0, -MARKDOWN_EXTENSION.length), text };
      } catch {
        // worklog.py:86-87 — a file that vanishes or fails to decode between
        // the directory listing and the read is skipped, not fatal.
        return null;
      }
    }),
  );
  return attempts.filter((entry): entry is WorklogEntry => entry !== null);
}

/**
 * Append raw text to `<date>.md`, used by deterministic hooks (`worklog.py:91-99`).
 * Returns the path written to.
 *
 * Python's separator check — `if os.path.getsize(p) if os.path.exists(p) else 0`
 * — runs AFTER `open(p, "a")` has already created the file, but opening in append
 * mode never truncates, so the size it observes is identical to checking before
 * opening: a file that doesn't exist yet, or exists empty, gets no leading blank
 * line; a file with existing content gets one. Checking first (as below) produces
 * the exact same byte layout, straightforwardly.
 */
export async function appendToDated(
  fs: FileSystem,
  ws: Workspace,
  slug: WorktreeSlug,
  date: string,
  text: string,
): Promise<AbsPath> {
  await ensureDir(fs, ws, slug);
  const path = datedPath(ws, slug, date);
  const hasExistingContent = (await fs.exists(path)) && (await fs.stat(path)).size > 0;
  const separator = hasExistingContent ? "\n" : "";
  await fs.appendFile(path, `${separator}${text.trimEnd()}\n`);
  return path;
}

/**
 * POSIX relative path from `from` to `to` (`os.path.relpath`), used only to stage
 * the worklogs directory relative to the kb git root (`worklog.py:108`). Both
 * inputs are already absolute and normalized `AbsPath`s, so this only needs to
 * diff path segments — no `.`/`..` resolution required on the inputs themselves.
 */
function relativePath(from: AbsPath, to: AbsPath): string {
  const fromParts = from.split("/").filter((part) => part !== "");
  const toParts = to.split("/").filter((part) => part !== "");

  let commonLength = 0;
  while (
    commonLength < fromParts.length &&
    commonLength < toParts.length &&
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength += 1;
  }

  const upSegments = fromParts.slice(commonLength).map(() => "..");
  const downSegments = toParts.slice(commonLength);
  const segments = [...upSegments, ...downSegments];
  return segments.length === 0 ? "." : segments.join("/");
}

/** `worklog.py:104-105` — `<kb>/.git` must exist and be a directory. */
async function isGitRepoDir(fs: FileSystem, path: AbsPath): Promise<boolean> {
  if (!(await fs.exists(path))) return false;
  const stat = await fs.stat(path);
  return stat.isDirectory;
}

/**
 * Commit worklog changes in the kb git repo, local only, best-effort
 * (`worklog.git_commit_worklogs`, `worklog.py:102-116`). No-ops (returns `false`)
 * outside a git repo. `Git.add`/`Git.commit` already absorb "ran vs. failed to
 * run" as their boolean result (their port doc), so this mirrors Python's
 * short-circuiting `try` block directly: if `add` didn't run, `commit` is never
 * attempted, matching a `subprocess.run` exception skipping the rest of the
 * `try` body. Neither call's own exit code matters — a no-op commit (nothing
 * staged) exits non-zero and is still success here (`worklog.py:111`'s comment).
 */
export async function commitWorklogs(
  fs: FileSystem,
  git: Git,
  ws: Workspace,
  message: string,
): Promise<boolean> {
  const gitDir = joinAbsPath(ws.kb, ".git");
  if (!(await isGitRepoDir(fs, gitDir))) return false;

  const relativeWorklogs = relativePath(ws.kb, ws.worklogs);
  const addRan = await git.add(ws.kb, [relativeWorklogs]);
  if (!addRan) return false;
  return await git.commit(ws.kb, message);
}
