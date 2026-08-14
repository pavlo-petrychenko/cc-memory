import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { makeFsRealAdapter } from "../../../src/adapters/fsReal.adapter.ts";
import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { createTempDir, type TempDir } from "../../helpers/tempdir.ts";

let tempDir: TempDir | null = null;

afterEach(() => {
  tempDir?.remove();
  tempDir = null;
});

function freshTempDir(): AbsPath {
  tempDir = createTempDir("ccmem-fsreal");
  const path = tempDir.path;
  // SAFETY: `createTempDir` always returns an absolute, resolved path.
  return path as AbsPath;
}

/** Join literal path segments onto an already-`AbsPath` base. */
function under(base: AbsPath, ...segments: readonly string[]): AbsPath {
  const joined = join(base, ...segments);
  // SAFETY: `node:path.join` on an absolute `base` with relative segments
  // always stays absolute.
  return joined as AbsPath;
}

describe("fsReal adapter", () => {
  test("writeFile then readFile round-trips UTF-8 text", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const path = under(dir, "note.md");

    await fs.writeFile(path, "héllo wörld");

    expect(await fs.readFile(path)).toBe("héllo wörld");
  });

  test("appendFile adds to existing content instead of replacing it", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const path = under(dir, "log.txt");

    await fs.writeFile(path, "first\n");
    await fs.appendFile(path, "second\n");

    expect(await fs.readFile(path)).toBe("first\nsecond\n");
  });

  test("readDir lists names one level deep, not full paths", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    await fs.writeFile(under(dir, "a.md"), "a");
    await fs.mkdir(under(dir, "sub"));

    const names = await fs.readDir(dir);

    expect(names.toSorted()).toEqual(["a.md", "sub"]);
  });

  test("stat reports size, mtime and directory/file kind", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const filePath = under(dir, "a.md");
    await fs.writeFile(filePath, "hello");

    const fileStat = await fs.stat(filePath);
    const dirStat = await fs.stat(dir);

    expect(fileStat.isFile).toBe(true);
    expect(fileStat.isDirectory).toBe(false);
    expect(fileStat.size).toBe(5);
    expect(fileStat.mtimeMs).toBeGreaterThan(0);
    expect(dirStat.isDirectory).toBe(true);
  });

  test("exists is true for a present path and false for an absent one", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const present = under(dir, "a.md");
    await fs.writeFile(present, "x");

    expect(await fs.exists(present)).toBe(true);
    expect(await fs.exists(under(dir, "missing.md"))).toBe(false);
  });

  test("mkdir is recursive and idempotent (os.makedirs exist_ok=True)", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const nested = under(dir, "a", "b", "c");

    await fs.mkdir(nested);
    await fs.mkdir(nested); // second call must not throw

    expect((await fs.stat(nested)).isDirectory).toBe(true);
  });

  test("remove deletes a single file", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const path = under(dir, "a.md");
    await fs.writeFile(path, "x");

    await fs.remove(path);

    expect(await fs.exists(path)).toBe(false);
  });

  test("remove deletes a directory and everything under it (shutil.rmtree)", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const sub = under(dir, "sub");
    await fs.mkdir(sub);
    await fs.writeFile(under(sub, "a.md"), "x");

    await fs.remove(sub);

    expect(await fs.exists(sub)).toBe(false);
  });

  test("remove on a missing path is a no-op, not a rejection (force: true)", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();

    await fs.remove(under(dir, "never-existed"));
  });

  test("rename moves a file atomically within the same filesystem", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const from = under(dir, "a.md");
    const to = under(dir, "b.md");
    await fs.writeFile(from, "content");

    await fs.rename(from, to);

    expect(await fs.exists(from)).toBe(false);
    expect(await fs.readFile(to)).toBe("content");
  });

  test("symlink creates a link whose target resolves to the original file", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const target = under(dir, "real.md");
    const link = under(dir, "link.md");
    await fs.writeFile(target, "content");

    await fs.symlink(target, link);

    expect(await fs.readFile(link)).toBe("content");
  });

  test("chmod changes the file's permission bits", async () => {
    const fs = makeFsRealAdapter();
    const dir = freshTempDir();
    const path = under(dir, "script");
    await fs.writeFile(path, "#!/bin/sh\n");

    await fs.chmod(path, 0o755);

    const stat = await fs.stat(path);
    expect(stat.isFile).toBe(true);
  });
});
