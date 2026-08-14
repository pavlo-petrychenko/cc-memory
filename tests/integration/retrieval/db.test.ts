import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { Workspace } from "../../../src/core/Workspace.ts";
import { makeFsRealAdapter } from "../../../src/platform/fsReal.adapter.ts";
import { openIndexDb } from "../../../src/retrieval/indexDb.service.ts";
import { SCHEMA_VERSION } from "../../../src/retrieval/schema.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { createTempDir, type TempDir } from "../../helpers/tempdir.ts";

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier — an opaque key into
// Container.openDb's per-path memoization, not a real filesystem path.
const IN_MEMORY_DB = ":memory:" as AbsPath;

function makeWorkspace(indexDb: AbsPath): Workspace {
  const kb = expandPath("/home/test/kb", HOME);
  const worklogs = expandPath("/home/test/kb/_Worklogs", HOME);
  return {
    id: "test",
    match: [kb],
    kb,
    worklogs,
    exclude: [],
    indexDb,
    matchedPrefix: kb,
  };
}

describe("index/db openIndexDb — schema-version / shared-handle behavior", () => {
  test("a fresh database gets SCHEMA_VERSION stamped via the initial full rebuild", async () => {
    const container = makeTestContainer({ fs: makeFsMemoryFake() });
    const workspace = makeWorkspace(IN_MEMORY_DB);

    const { db, forcedFullRebuild } = await openIndexDb(container, workspace);

    expect(forcedFullRebuild).toBe(true); // PRAGMA user_version starts at 0 < SCHEMA_VERSION
    expect(db.getUserVersion()).toBe(SCHEMA_VERSION);
  });

  test("a database already at SCHEMA_VERSION does not force a rebuild on the next open", async () => {
    const container = makeTestContainer({ fs: makeFsMemoryFake() });
    const workspace = makeWorkspace(IN_MEMORY_DB);

    await openIndexDb(container, workspace);
    const second = await openIndexDb(container, workspace);

    expect(second.forcedFullRebuild).toBe(false);
  });

  test("a stored version below SCHEMA_VERSION forces a full rebuild, wiping existing rows", async () => {
    const container = makeTestContainer({ fs: makeFsMemoryFake() });
    const workspace = makeWorkspace(IN_MEMORY_DB);

    const first = await openIndexDb(container, workspace);
    first.db.run(
      "INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?)",
      ["a.md", "A", "note", null, 1],
    );
    // Simulate a schema/tokenizer bump: the stored version is now behind
    // SCHEMA_VERSION again (lib/index.py:131-135).
    first.db.setUserVersion(SCHEMA_VERSION - 1);

    const second = await openIndexDb(container, workspace);

    expect(second.forcedFullRebuild).toBe(true);
    expect(second.db.getUserVersion()).toBe(SCHEMA_VERSION);
    expect(second.db.query("SELECT * FROM notes", [])).toEqual([]);
  });

  test("repeated opens of the same path share one Db handle ([[bugfixes]] #6)", async () => {
    const container = makeTestContainer({ fs: makeFsMemoryFake() });
    const workspace = makeWorkspace(IN_MEMORY_DB);

    const first = await openIndexDb(container, workspace);
    first.db.run(
      "INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?)",
      ["a.md", "A", "note", null, 1],
    );
    const second = await openIndexDb(container, workspace);

    expect(second.db.query("SELECT path FROM notes", [])).toEqual([{ path: "a.md" }]);
  });
});

describe("index/db openIndexDb — real filesystem", () => {
  let tempDir: TempDir | null = null;

  afterEach(() => {
    tempDir?.remove();
    tempDir = null;
  });

  test("creates the index_db's parent directory before opening it (lib/index.py:46-52)", async () => {
    tempDir = createTempDir("ccmem-index-db");
    // SAFETY: `createTempDir` always returns an absolute, resolved path.
    const root = tempDir.path as AbsPath;
    const indexDbPath = expandPath(join(root, "nested", "idx", "index.db"), HOME);
    const container = makeTestContainer({ fs: makeFsRealAdapter() });
    const workspace = makeWorkspace(indexDbPath);

    const { db } = await openIndexDb(container, workspace);

    expect(db.getUserVersion()).toBe(SCHEMA_VERSION);
    db.close();
  });
});
