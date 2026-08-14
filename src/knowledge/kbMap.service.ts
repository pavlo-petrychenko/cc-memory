import type { AbsPath } from "../core/AbsPath.ts";
import { tildify } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import type { KbMapFeature, KbMapInput } from "./kbMap.renderer.ts";
import { parseIndexNote } from "./note.ts";

/**
 * Scans a workspace's vault top level into a `KbMapInput` — the filesystem-
 * facing half of `session-start.build_kb_index` (`hooks/session-start.py:63-
 * 98`); the string-building half already lives in
 * `knowledge/kbMap.renderer.ts`, whose own doc comment names this file as
 * the caller that owns the "vault directory missing" short-circuit.
 */

// `DAILY` (`session-start.py:17`) — a top-level `.md` file matching this is a
// dated journal entry, excluded from "loose top-level notes".
const DAILY_JOURNAL_FILENAME = /^\d{4}-\d{2}-\d{2}\.md$/;

const MARKDOWN_EXTENSION = ".md";

/** Join a directory-entry name (from `fs.readDir`, never `.`/`..`/`~`) or a
 * fixed `<name>.md` filename onto an already-validated `AbsPath` — the same
 * per-file join helper duplicated in `services/worklog.service.ts` and
 * `retrieval/build.ts`'s `joinUnderDir` rather than shared, per their own
 * precedent. */
function joinAbsPath(base: AbsPath, ...segments: readonly string[]): AbsPath {
  const joined = [base, ...segments].join("/");
  // SAFETY: see the doc comment above.
  return joined as AbsPath;
}

/** `sorted(entries, key=str.lower)` (`session-start.py:68`) — Python's stable
 * sort keyed on the lowercased string, compared by ordinary (code-point)
 * ordering rather than locale collation. */
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

/** `parse_main_note(main) if os.path.isfile(main) else ("", "", "")`
 * (`session-start.py:82`) — a note that fails to read falls back to the same
 * empty triple as a missing one (`parse_main_note`'s own `except: return
 * title, desc, epic`, all three still `""`, `session-start.py:36-37`). */
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
 * `build_kb_index`'s filesystem half (`session-start.py:63-98`). Returns
 * `null` when the vault directory doesn't exist at all
 * (`if not os.path.isdir(kb): return ""`, `session-start.py:65-66`) — the
 * caller (`hooks/sessionStart.hook.ts`, P7) is what turns that into Python's
 * empty-string short-circuit, since an empty KB-map string and "no KB map at
 * all" both behave the same way once joined with the working-memory block.
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
  // while still building `features`/`looseNotes` in the same sorted order
  // Python's two list comprehensions produce.
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
