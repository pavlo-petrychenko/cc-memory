import type { Dirent } from "node:fs";
import { readdir, readFile, stat, realpath as fsRealpath } from "node:fs/promises";

export type FileStat = {
  isDirectory(): boolean;
  isFile(): boolean;
  mtimeMs: number;
  size: number;
};

export interface FileSystem {
  readdir(path: string, opts?: { withFileTypes?: boolean }): Promise<string[] | Dirent[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  stat(path: string): Promise<FileStat>;
  realpath(path: string): Promise<string>;
}

export class NodeFileSystem implements FileSystem {
  async readdir(
    path: string,
    opts?: { withFileTypes?: boolean },
  ): Promise<string[] | Dirent[]> {
    if (opts?.withFileTypes) {
      return readdir(path, { withFileTypes: true });
    }
    return readdir(path);
  }

  async readFile(path: string, encoding: "utf8"): Promise<string> {
    return readFile(path, encoding);
  }

  async stat(path: string): Promise<FileStat> {
    const st = await stat(path);
    return {
      isDirectory: () => st.isDirectory(),
      isFile: () => st.isFile(),
      mtimeMs: st.mtimeMs,
      size: st.size,
    };
  }

  async realpath(path: string): Promise<string> {
    return fsRealpath(path);
  }
}

export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  constructor(files: Record<string, string> = {}) {
    for (const [p, content] of Object.entries(files)) {
      this.files.set(p, content);
      // ensure dirs
      const parts = p.split("/").slice(0, -1);
      let cur = "";
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        this.dirs.add(cur);
      }
    }
  }

  async readdir(
    path: string,
    opts?: { withFileTypes?: boolean },
  ): Promise<string[] | Dirent[]> {
    const prefix = path.endsWith("/") ? path : path + "/";
    const entries = new Set<string>();
    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (seg) entries.add(seg);
      }
    }
    for (const d of this.dirs) {
      if (d.startsWith(prefix)) {
        const rest = d.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (seg) entries.add(seg);
      }
    }
    // also need to handle case where path is root and files at root
    const result = [...entries].sort() as string[];
    if (opts?.withFileTypes) {
      // return Dirent-like objects with isDirectory/isFile
      return result.map((name) => {
        const full = prefix + name;
        const isDir =
          this.dirs.has(full) ||
          [...this.files.keys()].some((f) => f.startsWith(full + "/"));
        return {
          name,
          isDirectory: () => isDir,
          isFile: () => !isDir && this.files.has(full),
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          isSymbolicLink: () => false,
          parentPath: path,
          path: path,
        } as unknown as Dirent;
      });
    }
    return result;
  }

  async readFile(path: string, _encoding: "utf8"): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }

  async stat(path: string): Promise<FileStat> {
    if (this.files.has(path)) {
      return {
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: Date.now(),
        size: this.files.get(path)!.length,
      };
    }
    if (
      this.dirs.has(path) ||
      [...this.files.keys()].some((f) => f.startsWith(path + "/"))
    ) {
      return {
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: Date.now(),
        size: 0,
      };
    }
    throw new Error(`ENOENT: ${path}`);
  }

  async realpath(path: string): Promise<string> {
    return path;
  }
}
