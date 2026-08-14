import type { AbsPath } from "../core/AbsPath.ts";

/**
 * The subset of `fs.Stats` this project actually reads: `os.path.getmtime` (index
 * incremental upsert, `wrap-gate.py:75`) and `os.path.getsize`/`os.path.isdir`
 * (worklog append separator, `worklog.py:96`). `mtimeMs` matches
 * `Date.prototype.getTime()` units (milliseconds), not the seconds Python's
 * `os.path.getmtime` returns — callers convert.
 */
export type FileStat = {
  readonly mtimeMs: number;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
};

/**
 * All filesystem I/O the rest of the codebase performs, as an interface —
 * Pure files never import this (the purity rule); only role-suffixed files and
 * `cli`/`hooks` entrypoints see a real or fake implementation.
 *
 * Every path in and out is an `AbsPath`: services resolve `~` and relative
 * fragments via `core/paths.ts` before calling here, so a port method never has
 * to guess what a bare string means (the same discipline that makes `Workspace`
 * vs `RawWorkspace` a compile-time distinction).
 *
 * Content is always UTF-8 text — every `open(...)` call this project ports from
 * reads/writes `encoding="utf-8"` (`index.py:82`, `worklog.py:65,84,95`,
 * `session-start.py:34`, `memory-inject.py:47`); there is no binary I/O anywhere
 * in the vault or registry.
 */
export type FileSystem = {
  readonly readFile: (path: AbsPath) => Promise<string>;
  readonly writeFile: (path: AbsPath, contents: string) => Promise<void>;
  readonly appendFile: (path: AbsPath, contents: string) => Promise<void>;
  /** Names only (not full paths), one level deep — matches `os.listdir`. */
  readonly readDir: (path: AbsPath) => Promise<readonly string[]>;
  readonly stat: (path: AbsPath) => Promise<FileStat>;
  readonly exists: (path: AbsPath) => Promise<boolean>;
  /** Recursive, idempotent — the port's only shape for `os.makedirs(..., exist_ok=True)`. */
  readonly mkdir: (path: AbsPath) => Promise<void>;
  /** Recursive, idempotent — covers both `os.remove` (file) and `shutil.rmtree` (dir). */
  readonly remove: (path: AbsPath) => Promise<void>;
  /** Atomic on the same filesystem — the tmp+rename pattern `registry.py:88-93` relies on. */
  readonly rename: (from: AbsPath, to: AbsPath) => Promise<void>;
  readonly symlink: (target: AbsPath, linkPath: AbsPath) => Promise<void>;
  readonly chmod: (path: AbsPath, mode: number) => Promise<void>;
};
