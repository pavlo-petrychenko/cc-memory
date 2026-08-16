import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Repository } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { joinAbs, relativeTo, stripChars } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import { MARKDOWN_EXTENSION } from "@/modules/note/note.constants.ts";
import type { Note } from "@/modules/note/note.entity.ts";
import type { NoteSummary } from "@/modules/note/note.typedefs.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";

export type NoteFile = {
  readonly path: AbsPath;
  readonly mtimeMs: number;
};

async function isDirectory(fs: FileSystem, path: AbsPath): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** Applied only to directory names during the walk — a `.md` file is never itself
 * checked, only the directories it's nested under. */
function isExcludedDir(relativePath: string, exclude: readonly string[]): boolean {
  if (relativePath.split("/").some((segment) => segment.startsWith("."))) return true;
  for (const rawExclude of exclude) {
    const trimmed = stripChars(rawExclude, "/");
    if (relativePath === trimmed || relativePath.startsWith(`${trimmed}/`)) return true;
  }
  return false;
}

async function walkDirLevel(
  fs: FileSystem,
  dir: AbsPath,
  relDir: string,
  exclude: readonly string[],
): Promise<readonly AbsPath[]> {
  const entryNames = [...(await fs.readDir(dir))].toSorted();
  const perEntry = await Promise.all(
    entryNames.map(async (name): Promise<readonly AbsPath[]> => {
      const childRelPath = relDir === "" ? name : `${relDir}/${name}`;
      const childAbsPath = joinAbs(dir, name);
      const stat = await fs.stat(childAbsPath);
      if (stat.isDirectory) {
        if (isExcludedDir(childRelPath, exclude)) return [];
        return walkDirLevel(fs, childAbsPath, childRelPath, exclude);
      }
      if (stat.isFile && name.endsWith(MARKDOWN_EXTENSION)) return [childAbsPath];
      return [];
    }),
  );
  return perEntry.flat();
}

/** A leading-dot-only "extension" (e.g. a file literally named `.md`) is not split
 * off — a dotfile is treated as having no extension. */
function fallbackTitleFromPath(path: AbsPath): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const lastDotIndex = base.lastIndexOf(".");
  return lastDotIndex <= 0 ? base : base.slice(0, lastDotIndex);
}

/** The note vault — the source of truth the index is a projection of. */
export class NoteRepository extends Repository {
  private readonly fs: FileSystem;
  private readonly parser: NoteParser;

  constructor(ctx: AppContext) {
    super(ctx);
    this.fs = ctx.gateways.fs;
    this.parser = new NoteParser();
  }

  async scanFiles(workspace: Workspace): Promise<readonly NoteFile[]> {
    if (!(await isDirectory(this.fs, workspace.kb))) return [];
    const paths = await walkDirLevel(this.fs, workspace.kb, "", workspace.exclude);
    return Promise.all(
      paths.map(async (path) => ({
        path,
        mtimeMs: (await this.fs.stat(path)).mtimeMs,
      })),
    );
  }

  async count(workspace: Workspace): Promise<number> {
    return (await this.scanFiles(workspace)).length;
  }

  async readNote(_workspace: Workspace, path: AbsPath): Promise<Note | null> {
    let text: string;
    try {
      text = await this.fs.readFile(path);
    } catch {
      return null;
    }
    const parsed = this.parser.parse(text, fallbackTitleFromPath(path));
    return { ...parsed, path };
  }

  /** Exhaustive, unlike the recall-limited BM25 queries — reads markdown directly,
   * so it is always current rather than a projection of the last reindex. */
  async list(workspace: Workspace, folder?: string): Promise<readonly NoteSummary[]> {
    const files = await this.scanFiles(workspace);
    const prefix =
      folder !== undefined && folder !== "" ? stripChars(folder, "/") : undefined;

    const inFolder = files.filter((file) => {
      const relativePath = relativeTo(file.path, workspace.kb);
      return (
        prefix === undefined ||
        relativePath === prefix ||
        relativePath.startsWith(`${prefix}/`)
      );
    });

    const summaries = await Promise.all(
      inFolder.map(async (file): Promise<NoteSummary | null> => {
        const note = await this.readNote(workspace, file.path);
        if (note === null) return null;
        return {
          path: relativeTo(file.path, workspace.kb),
          title: note.title,
          type: note.type,
          importance: note.importance,
        };
      }),
    );

    return summaries
      .filter((summary): summary is NoteSummary => summary !== null)
      .toSorted((left, right) => {
        if (left.path < right.path) return -1;
        if (left.path > right.path) return 1;
        return 0;
      });
  }
}
