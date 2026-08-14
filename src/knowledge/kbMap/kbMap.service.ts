import type { AbsPath } from "@/core/index.ts";
import { tildify } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import {
  DAILY_JOURNAL_FILENAME,
  MARKDOWN_EXTENSION,
} from "@/knowledge/kbMap/kbMap.constants.ts";
import type { KbMapFeature, KbMapInput } from "@/knowledge/kbMap/kbMap.typedefs.ts";
import { parseIndexNote } from "@/knowledge/note/index.ts";
import type { FileSystem } from "@/platform/index.ts";

/**
 * Scans a workspace's vault top level into a `KbMapInput` — the filesystem-
 * facing half of building the KB map. The string-building half lives in
 * `kbMap.formatter.ts`; this file owns the "vault directory missing"
 * short-circuit.
 */

/** Join a directory-entry name (from `fs.readDir`, never `.`/`..`/`~`) or a
 * fixed `<name>.md` filename onto an already-validated `AbsPath`. */
function joinAbsPath(base: AbsPath, ...segments: readonly string[]): AbsPath {
  const joined = [base, ...segments].join("/");
  // SAFETY: `base` is an already-validated AbsPath and every segment is a
  // plain filename (never `.`/`..`/`~`), so the joined path is itself an
  // absolute path.
  return joined as AbsPath;
}

/** Stable sort keyed on the lowercased string, compared by ordinary
 * (code-point) ordering rather than locale collation. */
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

/** A note that fails to parse falls back to the same empty
 * title/description/epic triple as a note that doesn't exist at all. */
async function readFeature(
  fs: FileSystem,
  kb: AbsPath,
  name: string,
): Promise<KbMapFeature> {
  const mainNotePath = joinAbsPath(kb, name, `${name}${MARKDOWN_EXTENSION}`);
  const hasIndexNote = await isFile(fs, mainNotePath);
  if (!hasIndexNote) {
    return { name, hasIndexNote, title: "", description: "", epic: "" };
  }
  try {
    const text = await fs.readFile(mainNotePath);
    const { title, description, epic } = parseIndexNote(text);
    return { name, hasIndexNote, title, description, epic };
  } catch {
    return { name, hasIndexNote, title: "", description: "", epic: "" };
  }
}

/**
 * Builds the filesystem-derived input for the KB map. Returns `null` when
 * the vault directory doesn't exist at all — the caller
 * (`sessionStart.hook.ts`) turns that into an empty-string short-circuit,
 * since an empty KB-map string and "no KB map at all" both behave the same
 * way once joined with the working-memory block.
 */
export async function buildKbMapInput(
  fs: FileSystem,
  workspace: Workspace,
  home: AbsPath,
): Promise<KbMapInput | null> {
  if (!(await isDirectory(fs, workspace.kb))) return null;

  const entryNames = [...(await fs.readDir(workspace.kb))].toSorted(
    compareCaseInsensitive,
  );
  const excluded = new Set(workspace.exclude);

  // `Promise.all` over the whole entry list (rather than an `await` per
  // iteration) keeps every directory-check/note-read in flight together
  // while still building `features`/`looseNotes` in sorted order.
  const entryIsDirectory = await Promise.all(
    entryNames.map((name) => isDirectory(fs, joinAbsPath(workspace.kb, name))),
  );
  const featureNames = entryNames.filter(
    (name, index) =>
      entryIsDirectory[index] === true && !name.startsWith(".") && !excluded.has(name),
  );
  const features = await Promise.all(
    featureNames.map((name) => readFeature(fs, workspace.kb, name)),
  );

  const looseNotes = entryNames
    .filter(
      (name) => name.endsWith(MARKDOWN_EXTENSION) && !DAILY_JOURNAL_FILENAME.test(name),
    )
    .map((name) => name.slice(0, -MARKDOWN_EXTENSION.length));

  return { vaultLabel: tildify(workspace.kb, home), features, looseNotes };
}
