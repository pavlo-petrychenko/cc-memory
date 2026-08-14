import type { AbsPath } from "@/core/index.ts";
import type { Workspace, WorktreeSlug } from "@/core/index.ts";
import type { FileSystem } from "@/platform/index.ts";
import type { Git } from "@/platform/index.ts";
import {
  DEFAULT_RECENT_ENTRIES_LIMIT,
  MARKDOWN_EXTENSION,
  PROPOSALS_DIR_NAME,
  STATE_FILENAME,
} from "@/worklog/services/worklogStore/worklogStore.constants.ts";
import type { WorklogEntry } from "@/worklog/worklog.typedefs.ts";

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

/**
 * Worklog (short-term/episodic memory) paths and I/O. Two files per worktree
 * under `<kb>/_Worklogs/<slug>/`: `STATE.md` (living) and `<date>.md`
 * (append-only journal). The templates themselves live in `worklogFormat`'s
 * `stateTemplate`/`entryTemplate` — this service only owns the filesystem side.
 */
export class WorklogStoreService {
  constructor(
    private readonly fs: FileSystem,
    private readonly git: Git,
  ) {}

  worktreeDir(ws: Workspace, slug: WorktreeSlug): AbsPath {
    return joinAbsPath(ws.worklogs, slug);
  }

  statePath(ws: Workspace, slug: WorktreeSlug): AbsPath {
    return joinAbsPath(this.worktreeDir(ws, slug), STATE_FILENAME);
  }

  datedPath(ws: Workspace, slug: WorktreeSlug, date: string): AbsPath {
    return joinAbsPath(this.worktreeDir(ws, slug), `${date}${MARKDOWN_EXTENSION}`);
  }

  proposalsDir(ws: Workspace): AbsPath {
    return joinAbsPath(ws.worklogs, PROPOSALS_DIR_NAME);
  }

  /** Creates the directory (idempotently) and returns it. */
  async ensureDir(ws: Workspace, slug: WorktreeSlug): Promise<AbsPath> {
    const dir = this.worktreeDir(ws, slug);
    await this.fs.mkdir(dir);
    return dir;
  }

  /**
   * `null` when `STATE.md` doesn't exist, isn't a regular file, or fails to
   * read for any reason.
   */
  async readState(ws: Workspace, slug: WorktreeSlug): Promise<string | null> {
    const path = this.statePath(ws, slug);
    try {
      const stat = await this.fs.stat(path);
      if (!stat.isFile) return null;
      return await this.fs.readFile(path);
    } catch {
      return null;
    }
  }

  /**
   * The most recent `limit` dated journal files (`STATE.md` excluded), newest
   * first. A worktree directory that doesn't exist (or isn't a directory)
   * yields `[]`; a file that fails to read is silently skipped.
   */
  async recentEntries(
    ws: Workspace,
    slug: WorktreeSlug,
    limit: number = DEFAULT_RECENT_ENTRIES_LIMIT,
  ): Promise<readonly WorklogEntry[]> {
    const dir = this.worktreeDir(ws, slug);
    let names: readonly string[];
    try {
      names = await this.fs.readDir(dir);
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
          const text = await this.fs.readFile(joinAbsPath(dir, fileName));
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
  async appendToDated(
    ws: Workspace,
    slug: WorktreeSlug,
    date: string,
    text: string,
  ): Promise<AbsPath> {
    await this.ensureDir(ws, slug);
    const path = this.datedPath(ws, slug, date);
    const hasExistingContent =
      (await this.fs.exists(path)) && (await this.fs.stat(path)).size > 0;
    const separator = hasExistingContent ? "\n" : "";
    await this.fs.appendFile(path, `${separator}${text.trimEnd()}\n`);
    return path;
  }

  /** `<kb>/.git` must exist and be a directory. */
  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    if (!(await this.fs.exists(path))) return false;
    const stat = await this.fs.stat(path);
    return stat.isDirectory;
  }

  /**
   * Commit worklog changes in the kb git repo, local only, best-effort. No-ops
   * (returns `false`) outside a git repo. `Git.add`/`Git.commit` already report
   * whether they ran as their boolean result, so if `add` didn't run, `commit`
   * is never attempted. Neither call's own exit code matters — a no-op commit
   * (nothing staged) still counts as success here.
   */
  async commitWorklogs(ws: Workspace, message: string): Promise<boolean> {
    const gitDir = joinAbsPath(ws.kb, ".git");
    if (!(await this.isGitRepoDir(gitDir))) return false;

    const relativeWorklogs = relativePath(ws.kb, ws.worklogs);
    const addRan = await this.git.add(ws.kb, [relativeWorklogs]);
    if (!addRan) return false;
    return await this.git.commit(ws.kb, message);
  }
}
