import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { joinAbs, tildify } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import type { KbMapFeature, KbMapInput } from "@/modules/kb/kbMap.typedefs.ts";
import { NoteParser } from "@/modules/note/index.ts";
import {
  DAILY_JOURNAL_FILENAME,
  MARKDOWN_EXTENSION,
} from "@/modules/note/note.constants.ts";

function compareCaseInsensitive(left: string, right: string): number {
  const lowerLeft = left.toLowerCase();
  const lowerRight = right.toLowerCase();
  if (lowerLeft < lowerRight) return -1;
  if (lowerLeft > lowerRight) return 1;
  return 0;
}

async function isDirectory(fs: FileSystem, path: AbsPath): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

async function isFile(fs: FileSystem, path: AbsPath): Promise<boolean> {
  try {
    return (await fs.stat(path)).isFile;
  } catch {
    return false;
  }
}

/** Scans a workspace's vault top level into a `KbMapInput` — the filesystem-facing
 * half of building the KB map. The string-building half lives in `kbMap.formatter.ts`. */
export class KbMapService extends Service {
  private readonly fs: FileSystem;
  private readonly noteParser: NoteParser;

  constructor(ctx: AppContext) {
    super(ctx);
    this.fs = ctx.gateways.fs;
    this.noteParser = new NoteParser();
  }

  private async readFeature(kb: AbsPath, name: string): Promise<KbMapFeature> {
    const mainNotePath = joinAbs(kb, name, `${name}${MARKDOWN_EXTENSION}`);
    const hasIndexNote = await isFile(this.fs, mainNotePath);
    if (!hasIndexNote) {
      return { name, hasIndexNote, title: "", description: "", epic: "" };
    }
    try {
      const text = await this.fs.readFile(mainNotePath);
      const { title, description, epic } = this.noteParser.parseIndex(text);
      return { name, hasIndexNote, title, description, epic };
    } catch {
      return { name, hasIndexNote, title: "", description: "", epic: "" };
    }
  }

  /** `null` when the vault directory doesn't exist at all — the caller turns that
   * into an empty-string short-circuit. */
  async build(workspace: Workspace, home: AbsPath): Promise<KbMapInput | null> {
    if (!(await isDirectory(this.fs, workspace.kb))) return null;

    const entryNames = [...(await this.fs.readDir(workspace.kb))].toSorted(
      compareCaseInsensitive,
    );
    const excluded = new Set(workspace.exclude);

    const entryIsDirectory = await Promise.all(
      entryNames.map((name) => isDirectory(this.fs, joinAbs(workspace.kb, name))),
    );
    const featureNames = entryNames.filter(
      (name, index) =>
        entryIsDirectory[index] === true && !name.startsWith(".") && !excluded.has(name),
    );
    const features = await Promise.all(
      featureNames.map((name) => this.readFeature(workspace.kb, name)),
    );

    const looseNotes = entryNames
      .filter(
        (name) => name.endsWith(MARKDOWN_EXTENSION) && !DAILY_JOURNAL_FILENAME.test(name),
      )
      .map((name) => name.slice(0, -MARKDOWN_EXTENSION.length));

    return { vaultLabel: tildify(workspace.kb, home), features, looseNotes };
  }
}
