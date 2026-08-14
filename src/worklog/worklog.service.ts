import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace, WorktreeSlug } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.typedefs.ts";
import type { Git } from "../platform/git.typedefs.ts";

/**
 * Worklog (short-term/episodic memory) paths and I/O. Two files per worktree
 * under `<kb>/_Worklogs/<slug>/`: `STATE.md` (living) and `<date>.md`
 * (append-only journal). The templates themselves live in `worklogFormat.ts`'s
 * `stateTemplate`/`entryTemplate` — this file only owns the filesystem side.
 */

const STATE_FILENAME = "STATE.md";
const MARKDOWN_EXTENSION = ".md";
const PROPOSALS_DIR_NAME = "_proposals";
const DEFAULT_RECENT_ENTRIES_LIMIT = 2;

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

export function worktreeDir(ws: Workspace, slug: WorktreeSlug): AbsPath {
  return joinAbsPath(ws.worklogs, slug);
}

export function statePath(ws: Workspace, slug: WorktreeSlug): AbsPath {
  return joinAbsPath(worktreeDir(ws, slug), STATE_FILENAME);
}

export function datedPath(ws: Workspace, slug: WorktreeSlug, date: string): AbsPath {
  return joinAbsPath(worktreeDir(ws, slug), `${date}${MARKDOWN_EXTENSION}`);
}

export function proposalsDir(ws: Workspace): AbsPath {
  return joinAbsPath(ws.worklogs, PROPOSALS_DIR_NAME);
}

/** Creates the directory (idempotently) and returns it. */
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
 * `null` when `STATE.md` doesn't exist, isn't a regular file, or fails to
 * read for any reason.
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
 * The most recent `limit` dated journal files (`STATE.md` excluded), newest
 * first. A worktree directory that doesn't exist (or isn't a directory)
 * yields `[]`; a file that fails to read is silently skipped.
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
        // A file that vanishes or fails to decode between the directory
        // listing and the read is skipped, not fatal.
        return null;
      }
    }),
  );
  return attempts.filter((entry): entry is WorklogEntry => entry !== null);
}

/**
 * Append raw text to `<date>.md`, used by deterministic hooks. Returns the
 * path written to.
 *
 * A file that doesn't exist yet, or exists empty, gets no leading blank line
 * before the appended text; a file with existing content gets one.
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
 * POSIX relative path from `from` to `to`, used only to stage the worklogs
 * directory relative to the kb git root. Both inputs are already absolute and
 * normalized `AbsPath`s, so this only needs to diff path segments — no
 * `.`/`..` resolution required on the inputs themselves.
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

/** `<kb>/.git` must exist and be a directory. */
async function isGitRepoDir(fs: FileSystem, path: AbsPath): Promise<boolean> {
  if (!(await fs.exists(path))) return false;
  const stat = await fs.stat(path);
  return stat.isDirectory;
}

/**
 * Commit worklog changes in the kb git repo, local only, best-effort. No-ops
 * (returns `false`) outside a git repo. `Git.add`/`Git.commit` already report
 * whether they ran as their boolean result, so if `add` didn't run, `commit`
 * is never attempted. Neither call's own exit code matters — a no-op commit
 * (nothing staged) still counts as success here.
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
