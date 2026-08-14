import * as nodeFs from "node:fs/promises";

import type { AbsPath } from "../core/AbsPath.ts";
import type { FileStat, FileSystem } from "./fileSystem.port.ts";

/**
 * The real `FileSystem`, over `node:fs/promises` (works under Bun same as
 * Node). Thin on purpose: every method is a direct pass-through, no branching,
 * no defaults — `mkdir`/`remove` bake in `recursive: true` so callers can
 * create nested directories or remove either a file or a directory without
 * knowing which up front.
 */
export function makeFsRealAdapter(): FileSystem {
  return {
    readFile: (path: AbsPath) => nodeFs.readFile(path, "utf-8"),
    writeFile: (path: AbsPath, contents: string) =>
      nodeFs.writeFile(path, contents, "utf-8"),
    appendFile: (path: AbsPath, contents: string) =>
      nodeFs.appendFile(path, contents, "utf-8"),
    readDir: (path: AbsPath) => nodeFs.readdir(path),
    stat: async (path: AbsPath): Promise<FileStat> => {
      const stats = await nodeFs.stat(path);
      return {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      };
    },
    exists: async (path: AbsPath) => {
      try {
        await nodeFs.access(path);
        return true;
      } catch {
        return false;
      }
    },
    mkdir: async (path: AbsPath) => {
      await nodeFs.mkdir(path, { recursive: true });
    },
    remove: async (path: AbsPath) => {
      await nodeFs.rm(path, { recursive: true, force: true });
    },
    rename: (from: AbsPath, to: AbsPath) => nodeFs.rename(from, to),
    symlink: (target: AbsPath, linkPath: AbsPath) => nodeFs.symlink(target, linkPath),
    chmod: (path: AbsPath, mode: number) => nodeFs.chmod(path, mode),
  };
}
