import * as nodeFs from "node:fs/promises";

import type { AbsPath } from "@/core/index.ts";
import type { FileStat, FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";

/** The real `FileSystem`, over `node:fs/promises`. Thin on purpose: every method
 * is a direct pass-through, no branching, no defaults. */
export class FileSystemAdapter implements FileSystem {
  readFile(path: AbsPath): Promise<string> {
    return nodeFs.readFile(path, "utf-8");
  }

  writeFile(path: AbsPath, contents: string): Promise<void> {
    return nodeFs.writeFile(path, contents, "utf-8");
  }

  appendFile(path: AbsPath, contents: string): Promise<void> {
    return nodeFs.appendFile(path, contents, "utf-8");
  }

  readDir(path: AbsPath): Promise<readonly string[]> {
    return nodeFs.readdir(path);
  }

  async stat(path: AbsPath): Promise<FileStat> {
    const stats = await nodeFs.stat(path);
    return {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
    };
  }

  async exists(path: AbsPath): Promise<boolean> {
    try {
      await nodeFs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: AbsPath): Promise<void> {
    await nodeFs.mkdir(path, { recursive: true });
  }

  async remove(path: AbsPath): Promise<void> {
    await nodeFs.rm(path, { recursive: true, force: true });
  }

  rename(from: AbsPath, to: AbsPath): Promise<void> {
    return nodeFs.rename(from, to);
  }

  symlink(target: AbsPath, linkPath: AbsPath): Promise<void> {
    return nodeFs.symlink(target, linkPath);
  }

  chmod(path: AbsPath, mode: number): Promise<void> {
    return nodeFs.chmod(path, mode);
  }
}
