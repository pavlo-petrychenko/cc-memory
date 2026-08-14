import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/domain/AbsPath.ts";
import { makeFsMemoryFake } from "../../../helpers/fakes/fsMemory.fake.ts";

/** Test-only path fixture builder: every literal below is already an absolute,
 * normalized path, so this is the single cast the whole file needs. */
function p(path: string): AbsPath {
  // SAFETY: every call site passes a literal absolute path fixture, never
  // untrusted input.
  return path as AbsPath;
}

const VAULT = p("/vault");
const NOTE = p("/vault/Feature/Note.md");

describe("fsMemory fake", () => {
  test("seedFile then readFile round-trips content", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "# Note");

    expect(await fs.readFile(NOTE)).toBe("# Note");
  });

  test("readFile on a missing path rejects", () => {
    const fs = makeFsMemoryFake();

    expect(fs.readFile(NOTE)).rejects.toThrow();
  });

  test("writeFile creates parent directories implicitly", async () => {
    const fs = makeFsMemoryFake();

    await fs.writeFile(NOTE, "content");

    expect(await fs.exists(VAULT)).toBe(true);
    expect((await fs.stat(p("/vault/Feature"))).isDirectory).toBe(true);
  });

  test("appendFile appends to existing content", async () => {
    const fs = makeFsMemoryFake();
    await fs.writeFile(NOTE, "first");

    await fs.appendFile(NOTE, "-second");

    expect(await fs.readFile(NOTE)).toBe("first-second");
  });

  test("appendFile on a missing file behaves like starting from empty", async () => {
    const fs = makeFsMemoryFake();

    await fs.appendFile(NOTE, "only");

    expect(await fs.readFile(NOTE)).toBe("only");
  });

  test("readDir lists immediate children only, files and dirs together", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(p("/vault/a.md"), "a");
    fs.seedFile(p("/vault/Feature/b.md"), "b");

    const names = await fs.readDir(VAULT);

    expect(names).toEqual(["Feature", "a.md"]);
  });

  test("readDir on a missing directory rejects", () => {
    const fs = makeFsMemoryFake();

    expect(fs.readDir(VAULT)).rejects.toThrow();
  });

  test("stat reports file size (UTF-8 byte length) and isFile", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "héllo"); // 6 bytes UTF-8, 5 chars

    const stat = await fs.stat(NOTE);

    expect(stat.isFile).toBe(true);
    expect(stat.isDirectory).toBe(false);
    expect(stat.size).toBe(6);
  });

  test("mtimeOf reads the seeded mtime directly", () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "x", 1000);

    expect(fs.mtimeOf(NOTE)).toBe(1000);
  });

  test("advanceAllMtimes moves every file's mtime forward by the same delta", () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "x", 1000);
    fs.seedFile(p("/vault/a.md"), "y", 2000);

    fs.advanceAllMtimes(500);

    expect(fs.mtimeOf(NOTE)).toBe(1500);
    expect(fs.mtimeOf(p("/vault/a.md"))).toBe(2500);
  });

  test("writeFile after advancing mtimes stamps the new synthetic clock value", async () => {
    const fs = makeFsMemoryFake();
    fs.advanceAllMtimes(1000);

    await fs.writeFile(NOTE, "content");

    expect(fs.mtimeOf(NOTE)).toBe(1000);
  });

  test("exists is true for both files and directories, false otherwise", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(VAULT);

    expect(await fs.exists(VAULT)).toBe(true);
    expect(await fs.exists(NOTE)).toBe(false);
  });

  test("mkdir is idempotent and creates ancestors", async () => {
    const fs = makeFsMemoryFake();

    await fs.mkdir(p("/vault/a/b/c"));
    await fs.mkdir(p("/vault/a/b/c"));

    expect((await fs.stat(p("/vault/a/b"))).isDirectory).toBe(true);
  });

  test("remove deletes a single file without touching siblings", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "x");
    fs.seedFile(p("/vault/Feature/Other.md"), "y");

    await fs.remove(NOTE);

    expect(await fs.exists(NOTE)).toBe(false);
    expect(await fs.exists(p("/vault/Feature/Other.md"))).toBe(true);
  });

  test("remove on a directory deletes everything nested under it", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "x");
    fs.seedFile(p("/vault/Feature/Other.md"), "y");

    await fs.remove(p("/vault/Feature"));

    expect(await fs.exists(NOTE)).toBe(false);
    expect(await fs.exists(p("/vault/Feature/Other.md"))).toBe(false);
    expect(await fs.exists(VAULT)).toBe(true);
  });

  test("rename moves a single file", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "content");

    await fs.rename(NOTE, p("/vault/Feature/Renamed.md"));

    expect(await fs.exists(NOTE)).toBe(false);
    expect(await fs.readFile(p("/vault/Feature/Renamed.md"))).toBe("content");
  });

  test("rename moves a directory and rewrites every descendant's path", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "content");
    fs.seedFile(p("/vault/Feature/Other.md"), "content2");

    await fs.rename(p("/vault/Feature"), p("/vault/Renamed"));

    expect(await fs.exists(NOTE)).toBe(false);
    expect(await fs.readFile(p("/vault/Renamed/Note.md"))).toBe("content");
    expect(await fs.readFile(p("/vault/Renamed/Other.md"))).toBe("content2");
  });

  test("symlink records the link as existing and pointing at its target path (no dereferencing)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(p("/vault/real.md"), "content");

    await fs.symlink(p("/vault/real.md"), p("/vault/link.md"));

    expect(await fs.exists(p("/vault/link.md"))).toBe(true);
    expect(await fs.readFile(p("/vault/link.md"))).toBe("/vault/real.md");
  });

  test("chmod is a no-op that never rejects", () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(NOTE, "x");

    expect(fs.chmod(NOTE, 0o755)).resolves.toBeUndefined();
  });
});
