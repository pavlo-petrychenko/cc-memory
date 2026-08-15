import type { AbsPath } from "@/core/index.ts";

/** The subset of `fs.Stats` this project actually reads. `mtimeMs` is in
 * milliseconds, matching `Date.prototype.getTime()` units. */
export type FileStat = {
  readonly mtimeMs: number;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
};

/** All filesystem I/O the rest of the codebase performs. Every path in and out is
 * an `AbsPath` — a port method never has to guess what a bare string means. Content
 * is always UTF-8 text; there is no binary I/O anywhere in the vault or registry. */
export type FileSystem = {
  readonly readFile: (path: AbsPath) => Promise<string>;
  readonly writeFile: (path: AbsPath, contents: string) => Promise<void>;
  readonly appendFile: (path: AbsPath, contents: string) => Promise<void>;
  /** Names only (not full paths), one level deep. */
  readonly readDir: (path: AbsPath) => Promise<readonly string[]>;
  readonly stat: (path: AbsPath) => Promise<FileStat>;
  readonly exists: (path: AbsPath) => Promise<boolean>;
  /** Recursive, idempotent. */
  readonly mkdir: (path: AbsPath) => Promise<void>;
  /** Recursive, idempotent — covers both a file and a directory tree. */
  readonly remove: (path: AbsPath) => Promise<void>;
  /** Atomic on the same filesystem — the tmp+rename pattern relies on this. */
  readonly rename: (from: AbsPath, to: AbsPath) => Promise<void>;
  readonly symlink: (target: AbsPath, linkPath: AbsPath) => Promise<void>;
  readonly chmod: (path: AbsPath, mode: number) => Promise<void>;
};
