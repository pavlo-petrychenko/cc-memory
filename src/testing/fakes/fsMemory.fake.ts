import type { AbsPath } from "@/core/index.ts";
import { absPath, parentDir } from "@/core/index.ts";
import type { FileStat, FileSystem } from "@/gateways/index.ts";

type MemoryFile = { readonly kind: "file"; contents: string; mtimeMs: number };
type MemoryDir = { readonly kind: "dir" };
type MemoryEntry = MemoryFile | MemoryDir;

export type FsMemoryFake = FileSystem & {
  readonly seedFile: (path: AbsPath, contents: string, mtimeMs?: number) => void;
  readonly seedDir: (path: AbsPath) => void;
  readonly advanceAllMtimes: (deltaMs: number) => void;
  readonly mtimeOf: (path: AbsPath) => number;
};

const ROOT = "/";

function rejoin(newPrefix: AbsPath, suffix: string): AbsPath {
  return absPath(newPrefix + suffix);
}

function notFound(path: AbsPath): Error {
  return new Error(`ENOENT: no such file or directory, '${path}'`);
}

/** An in-memory `FileSystem`: a flat `Map<AbsPath, MemoryEntry>` keyed by exact path.
 * Every write mutates a clock-free `mtimeMs`; only `advanceAllMtimes` moves it
 * forward, so a test controls exactly when a file "changes". */
export function makeFsMemoryFake(): FsMemoryFake {
  const entries = new Map<AbsPath, MemoryEntry>();
  let syntheticNowMs = 0;

  function requireFile(path: AbsPath): MemoryFile {
    const entry = entries.get(path);
    if (entry === undefined || entry.kind !== "file") throw notFound(path);
    return entry;
  }

  function ensureDirsUpTo(path: AbsPath): void {
    let current = parentDir(path);
    while (current !== ROOT && !entries.has(current)) {
      entries.set(current, { kind: "dir" });
      current = parentDir(current);
    }
  }

  return {
    seedFile: (path: AbsPath, contents: string, mtimeMs = 0) => {
      ensureDirsUpTo(path);
      entries.set(path, { kind: "file", contents, mtimeMs });
    },
    seedDir: (path: AbsPath) => {
      entries.set(path, { kind: "dir" });
    },
    advanceAllMtimes: (deltaMs: number) => {
      syntheticNowMs += deltaMs;
      for (const entry of entries.values()) {
        if (entry.kind === "file") entry.mtimeMs += deltaMs;
      }
    },
    mtimeOf: (path: AbsPath) => requireFile(path).mtimeMs,

    // `async`, not a bare `Promise.resolve(...)`, so a missing-file throw inside
    // `requireFile` becomes a rejected promise, matching every other async I/O port.
    readFile: async (path: AbsPath) => requireFile(path).contents,
    writeFile: (path: AbsPath, contents: string) => {
      ensureDirsUpTo(path);
      entries.set(path, { kind: "file", contents, mtimeMs: syntheticNowMs });
      return Promise.resolve();
    },
    appendFile: (path: AbsPath, contents: string) => {
      ensureDirsUpTo(path);
      const existing = entries.get(path);
      const priorContents = existing?.kind === "file" ? existing.contents : "";
      entries.set(path, {
        kind: "file",
        contents: priorContents + contents,
        mtimeMs: syntheticNowMs,
      });
      return Promise.resolve();
    },
    readDir: async (path: AbsPath) => {
      if (!entries.has(path)) throw notFound(path);
      const prefix = path === ROOT ? ROOT : `${path}/`;
      const names = new Set<string>();
      for (const candidate of entries.keys()) {
        if (candidate === path || !candidate.startsWith(prefix)) continue;
        const rest = candidate.slice(prefix.length);
        const name = rest.split("/")[0];
        if (name !== undefined && name !== "") names.add(name);
      }
      return Array.from(names).toSorted();
    },
    stat: async (path: AbsPath): Promise<FileStat> => {
      const entry = entries.get(path);
      if (entry === undefined) throw notFound(path);
      return {
        mtimeMs: entry.kind === "file" ? entry.mtimeMs : 0,
        size: entry.kind === "file" ? Buffer.byteLength(entry.contents, "utf-8") : 0,
        isDirectory: entry.kind === "dir",
        isFile: entry.kind === "file",
      };
    },
    exists: (path: AbsPath) => Promise.resolve(entries.has(path)),
    mkdir: (path: AbsPath) => {
      ensureDirsUpTo(path);
      if (!entries.has(path)) entries.set(path, { kind: "dir" });
      return Promise.resolve();
    },
    remove: (path: AbsPath) => {
      const prefix = `${path}/`;
      for (const candidate of Array.from(entries.keys())) {
        if (candidate === path || candidate.startsWith(prefix)) entries.delete(candidate);
      }
      return Promise.resolve();
    },
    rename: (from: AbsPath, to: AbsPath) => {
      const prefix = `${from}/`;
      ensureDirsUpTo(to);
      for (const [candidate, entry] of Array.from(entries.entries())) {
        if (candidate === from) {
          entries.delete(candidate);
          entries.set(to, entry);
        } else if (candidate.startsWith(prefix)) {
          entries.delete(candidate);
          entries.set(rejoin(to, candidate.slice(from.length)), entry);
        }
      }
      return Promise.resolve();
    },
    symlink: (target: AbsPath, linkPath: AbsPath) => {
      // Represented as a file whose contents are the target — good enough for the
      // one caller that cares, which only checks existence/identity, never dereferences.
      ensureDirsUpTo(linkPath);
      entries.set(linkPath, { kind: "file", contents: target, mtimeMs: syntheticNowMs });
      return Promise.resolve();
    },
    chmod: () => Promise.resolve(),
  };
}
