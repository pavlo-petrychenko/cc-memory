import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import type { Candidate } from "../worklog/Candidate.ts";
import { dedupeCandidates, extractCandidates } from "../worklog/worklogFormat.ts";

/**
 * Walk the worklogs tree for promotion candidates (`gather_candidates`,
 * `bin/reflector.py:52-88`). Every actual line-level rule (`#promote`, the
 * `**Learned:**`/`**Decided:**` field lines, dedup) is already ported to
 * `domain/worklogFormat.ts`'s `extractCandidates`/`dedupeCandidates` — this
 * file only owns the filesystem walk: which slugs/files are eligible, and the
 * `since` mtime filter.
 */

const STATE_FILENAME = "STATE.md";
const PROPOSALS_DIR_NAME = "_proposals";
const MARKDOWN_EXTENSION = ".md";

async function isDirectory(fs: FileSystem, path: AbsPath): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false; // matches `os.path.isdir` returning False for a missing path
  }
}

/** Join a name returned by `readDir` onto an already-validated `AbsPath` directory. */
function joinUnderDir(dir: AbsPath, name: string): AbsPath {
  // SAFETY: `dir` is an already-absolute, normalized `AbsPath`; `name` is one
  // entry `FileSystem.readDir` returned for it, so the join stays absolute
  // and normalized — the same reasoning `retrieval/build.ts`'s
  // `joinUnderDir` documents for the identical operation.
  return `${dir}/${name}` as AbsPath;
}

/** One dated journal file's candidates, or `[]` if it's `STATE.md`, unreadable,
 * or older than `sinceMs` (`bin/reflector.py:61-66`). `sinceMs <= 0` means
 * "no filter" — Python's `if since:` is falsy for a never-yet-run `since = 0`,
 * so every file counts regardless of mtime. */
async function gatherFileCandidates(
  fs: FileSystem,
  slugDir: AbsPath,
  slug: string,
  fileName: string,
  sinceMs: number,
): Promise<readonly Candidate[]> {
  if (fileName === STATE_FILENAME || !fileName.endsWith(MARKDOWN_EXTENSION)) return [];
  const filePath = joinUnderDir(slugDir, fileName);
  const mtimeMs = (await fs.stat(filePath)).mtimeMs;
  if (sinceMs > 0 && mtimeMs < sinceMs) return [];
  let text: string;
  try {
    text = await fs.readFile(filePath);
  } catch {
    return []; // bin/reflector.py:69-70 — an unreadable file is skipped, not fatal
  }
  return extractCandidates(text, `${slug}/${fileName}`);
}

/** One worktree slug directory's candidates across every eligible dated file
 * (`bin/reflector.py:57-80`). A slug that isn't a directory (or has vanished
 * between the outer listing and this check) contributes nothing. */
async function gatherSlugCandidates(
  fs: FileSystem,
  worklogsRoot: AbsPath,
  slug: string,
  sinceMs: number,
): Promise<readonly Candidate[]> {
  const slugDir = joinUnderDir(worklogsRoot, slug);
  if (!(await isDirectory(fs, slugDir))) return [];
  const fileNames = [...(await fs.readDir(slugDir))].toSorted();
  const perFile = await Promise.all(
    fileNames.map((fileName) =>
      gatherFileCandidates(fs, slugDir, slug, fileName, sinceMs),
    ),
  );
  return perFile.flat();
}

/**
 * `gather_candidates` (`bin/reflector.py:52-88`): every `#promote`/
 * `**Learned:**`/`**Decided:**` candidate line across worklog files modified
 * at or after `sinceMs`, skipping `STATE.md`, dot-prefixed directories and
 * `_proposals`, de-duplicated case-insensitively by text (first occurrence
 * wins). A missing `worklogs` directory yields `[]`, matching Python's
 * `if not os.path.isdir(root): return out`.
 */
export async function gatherCandidates(
  fs: FileSystem,
  workspace: Workspace,
  sinceMs: number,
): Promise<readonly Candidate[]> {
  if (!(await isDirectory(fs, workspace.worklogs))) return [];
  const slugNames = [...(await fs.readDir(workspace.worklogs))].toSorted();
  const eligibleSlugs = slugNames.filter(
    (slug) => !slug.startsWith(".") && slug !== PROPOSALS_DIR_NAME,
  );
  const perSlug = await Promise.all(
    eligibleSlugs.map((slug) =>
      gatherSlugCandidates(fs, workspace.worklogs, slug, sinceMs),
    ),
  );
  return dedupeCandidates(perSlug.flat());
}
