import type { AbsPath } from "@/core/index.ts";
import { joinAbs } from "@/core/index.ts";
import type { Workspace, WorktreeSlug } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import type { Git } from "@/gateways/index.ts";
import {
  DEFAULT_RECENT_ENTRIES_LIMIT,
  MARKDOWN_EXTENSION,
  PROPOSALS_DIR_NAME,
  STATE_FILENAME,
} from "@/modules/worklog/services/worklogStore/worklogStore.constants.ts";
import type { WorklogEntry } from "@/modules/worklog/worklog.typedefs.ts";

export type WorklogFile = {
  readonly path: AbsPath;
  readonly slug: string;
  readonly date: string;
  readonly mtimeMs: number;
};

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

/** Worklog paths and I/O: `STATE.md` and `<date>.md` under `<kb>/_Worklogs/<slug>/`.
 * The templates live in `worklogFormat` — this service only owns the filesystem side. */
export class WorklogStoreService {
  constructor(
    private readonly fs: FileSystem,
    private readonly git: Git,
  ) {}

  worktreeDir(ws: Workspace, slug: WorktreeSlug): AbsPath {
    return joinAbs(ws.worklogs, slug);
  }

  statePath(ws: Workspace, slug: WorktreeSlug): AbsPath {
    return joinAbs(this.worktreeDir(ws, slug), STATE_FILENAME);
  }

  datedPath(ws: Workspace, slug: WorktreeSlug, date: string): AbsPath {
    return joinAbs(this.worktreeDir(ws, slug), `${date}${MARKDOWN_EXTENSION}`);
  }

  proposalsDir(ws: Workspace): AbsPath {
    return joinAbs(ws.worklogs, PROPOSALS_DIR_NAME);
  }

  async ensureDir(ws: Workspace, slug: WorktreeSlug): Promise<AbsPath> {
    const dir = this.worktreeDir(ws, slug);
    await this.fs.mkdir(dir);
    return dir;
  }

  /** `null` when `STATE.md` doesn't exist, isn't a regular file, or fails to read. */
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

  /** Every `.md` file under `<worklogs>/<slug>/`, for reprojection. */
  async scanWorklogFiles(ws: Workspace): Promise<readonly WorklogFile[]> {
    let slugs: readonly string[];
    try {
      slugs = await this.fs.readDir(ws.worklogs);
    } catch {
      return [];
    }

    const perSlug = await Promise.all(
      slugs.map(async (slug): Promise<readonly WorklogFile[]> => {
        if (slug.startsWith(".")) return [];
        const slugDir = joinAbs(ws.worklogs, slug);
        let names: readonly string[];
        try {
          names = await this.fs.readDir(slugDir);
        } catch {
          return [];
        }
        const markdownNames = names
          .filter((name) => name.endsWith(MARKDOWN_EXTENSION))
          .toSorted();
        const files = await Promise.all(
          markdownNames.map(async (name): Promise<WorklogFile | null> => {
            const path = joinAbs(slugDir, name);
            try {
              const mtimeMs = (await this.fs.stat(path)).mtimeMs;
              return {
                path,
                slug,
                date: name === STATE_FILENAME ? "STATE" : name.slice(0, -3),
                mtimeMs,
              };
            } catch {
              return null;
            }
          }),
        );
        return files.filter((file): file is WorklogFile => file !== null);
      }),
    );
    return perSlug.flat();
  }

  async readWorklogFile(path: AbsPath): Promise<string> {
    return this.fs.readFile(path);
  }

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
          const text = await this.fs.readFile(joinAbs(dir, fileName));
          return { date: fileName.slice(0, -MARKDOWN_EXTENSION.length), text };
        } catch {
          return null;
        }
      }),
    );
    return attempts.filter((entry): entry is WorklogEntry => entry !== null);
  }

  /** A missing or empty file gets no leading blank line before the appended text;
   * a file with existing content gets one. */
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

  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    if (!(await this.fs.exists(path))) return false;
    const stat = await this.fs.stat(path);
    return stat.isDirectory;
  }

  /** No-ops outside a git repo. If `add` didn't run, `commit` is never attempted. */
  async commitWorklogs(ws: Workspace, message: string): Promise<boolean> {
    const gitDir = joinAbs(ws.kb, ".git");
    if (!(await this.isGitRepoDir(gitDir))) return false;

    const relativeWorklogs = relativePath(ws.kb, ws.worklogs);
    const addRan = await this.git.add(ws.kb, [relativeWorklogs]);
    if (!addRan) return false;
    return await this.git.commit(ws.kb, message);
  }
}
