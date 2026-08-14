/**
 * Temp-directory helpers shared by every test level that needs a throwaway
 * filesystem: a scratch dir with a cleanup handle, plus a directory-tree
 * snapshot used by the parity differ (tests/parity/harness.ts) to compare a
 * sandboxed $HOME/vault before and after a run.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

export type TempDir = {
  readonly path: string;
  readonly remove: () => void;
};

/**
 * Create a fresh temp directory under the OS temp root, prefixed for easy
 * identification. Resolved to its real path: on macOS the OS temp root
 * (`/var/folders/...`) is itself a symlink into `/private`, and a spawned
 * process's `os.getcwd()` returns the resolved form — so an unresolved path
 * used as a registry `match` prefix or `$HOME` would silently fail to match.
 */
export function createTempDir(prefix: string): TempDir {
  const path = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}

export type TreeEntry = {
  readonly relativePath: string;
  readonly contents: string;
};

/**
 * A `.git` directory's object/ref layout is content-addressed by commit
 * timestamp, so two independent runs of identical code produce different
 * bytes and different object filenames even with nothing behaviorally
 * different. We still want to know a repo is *there* (workspace add / memory
 * commit are meant to create one), so the walk records one placeholder entry
 * for the directory itself and does not recurse into it.
 */
const GIT_DIR_NAME = ".git";

/** Basenames whose exact bytes are derived/volatile and excluded from content
 * comparison — see the per-name rationale next to each masking rule below. */
function isVolatileBasename(basename: string): boolean {
  return basename === "index.db" || basename === ".last-reflect";
}

function readTextOrPlaceholder(absolutePath: string): string {
  const buffer = readFileSync(absolutePath);
  if (looksBinary(buffer)) {
    return `<binary:${buffer.byteLength} bytes>`;
  }
  return buffer.toString("utf-8");
}

/** Git's own heuristic: a NUL byte in the first few KB means "binary". SQLite's
 * index.db is already excluded by name, but this also protects against any
 * other unexpected binary artifact showing up as raw garbage in a diff. */
function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.byteLength, 8000);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively snapshot a directory as a sorted list of {relativePath,
 * contents}. `.git` directories are recorded but not recursed into; known
 * volatile files (see isVolatileBasename) get a fixed placeholder instead of
 * their real bytes. Returns `[]` if `rootPath` does not exist (a workspace
 * that was never created, e.g. after `workspace rm --purge`).
 */
export function snapshotTree(rootPath: string): readonly TreeEntry[] {
  const entries: TreeEntry[] = [];
  walk(rootPath, rootPath, entries);
  return entries.toSorted((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function walk(rootPath: string, currentPath: string, entries: TreeEntry[]): void {
  let names: readonly string[];
  try {
    names = readdirSync(currentPath);
  } catch {
    return; // rootPath (or a race-deleted subdir) does not exist — empty snapshot
  }
  for (const name of names) {
    const absolutePath = join(currentPath, name);
    const relativePath = relative(rootPath, absolutePath).split(sep).join("/");
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      if (name === GIT_DIR_NAME) {
        entries.push({ relativePath, contents: "<git repo>" });
        continue;
      }
      walk(rootPath, absolutePath, entries);
      continue;
    }
    entries.push({
      relativePath,
      contents: isVolatileBasename(name)
        ? `<derived:${name}>`
        : readTextOrPlaceholder(absolutePath),
    });
  }
}
