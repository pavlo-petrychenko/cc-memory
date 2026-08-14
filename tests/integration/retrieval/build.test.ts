import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { Workspace } from "../../../src/core/Workspace.ts";
import type { FileSystem } from "../../../src/platform/fileSystem.typedefs.ts";
import { buildIndex } from "../../../src/retrieval/build.service.ts";
import { openIndexDb } from "../../../src/retrieval/indexDb.service.ts";
import { listNotes } from "../../../src/retrieval/notes.service.ts";
import { SCHEMA_VERSION } from "../../../src/retrieval/schema.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier — an opaque key into
// Container.openDatabase's per-path memoization, not a real filesystem path.
const IN_MEMORY_DB = ":memory:" as AbsPath;

function under(relativePath: string): AbsPath {
  return expandPath(`/home/test/kb/${relativePath}`, HOME);
}

function underWorklogs(relativePath: string): AbsPath {
  return expandPath(`/home/test/kb/_Worklogs/${relativePath}`, HOME);
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const kb = expandPath("/home/test/kb", HOME);
  const worklogs = expandPath("/home/test/kb/_Worklogs", HOME);
  return {
    id: "test",
    match: [kb],
    kb,
    worklogs,
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: IN_MEMORY_DB,
    matchedPrefix: kb,
    ...overrides,
  };
}

const NOTE_A = "---\ntype: note\n---\n# Alpha Note\nsome body text about apples.\n";
const NOTE_B = "---\ntype: note\n---\n# Beta Note\nsome other body text about oranges.\n";

describe("index/build buildIndex — notes", () => {
  test("initial full build adds every markdown note", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("B.md"), NOTE_B, 100);
    const container = makeTestContainer({ fs });

    const stats = await buildIndex(container, makeWorkspace(), { incremental: false });

    expect(stats).toEqual({ added: 2, updated: 0, removed: 0, total: 2 });
  });

  test("a second build with untouched mtimes skips every file (updated === 0)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("B.md"), NOTE_B, 100);
    const container = makeTestContainer({ fs });
    await buildIndex(container, makeWorkspace(), { incremental: false });

    const stats = await buildIndex(container, makeWorkspace());

    expect(stats).toEqual({ added: 0, updated: 0, removed: 0, total: 2 });
  });

  test("a file whose mtime moved is re-parsed and counted as updated", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("B.md"), NOTE_B, 100);
    const container = makeTestContainer({ fs });
    await buildIndex(container, makeWorkspace(), { incremental: false });

    fs.seedFile(under("A.md"), "---\ntype: note\n---\n# Alpha Renamed\nnew body.\n", 200);
    const stats = await buildIndex(container, makeWorkspace());

    expect(stats).toEqual({ added: 0, updated: 1, removed: 0, total: 2 });
    const notes = await listNotes(container, makeWorkspace());
    const renamed = notes.find((note) => note.path === "A.md");
    expect(renamed?.title).toBe("Alpha Renamed");
  });

  test("prune: a note deleted from disk is removed from the index on reindex", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("B.md"), NOTE_B, 100);
    const container = makeTestContainer({ fs });
    await buildIndex(container, makeWorkspace(), { incremental: false });

    await fs.remove(under("B.md"));
    const stats = await buildIndex(container, makeWorkspace());

    expect(stats).toEqual({ added: 0, updated: 0, removed: 1, total: 1 });
    const notes = await listNotes(container, makeWorkspace());
    expect(notes.map((note) => note.path)).toEqual(["A.md"]);
  });

  test("a schema-version bump forces a full rebuild even with incremental: true", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("B.md"), NOTE_B, 100);
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();
    await buildIndex(container, workspace, { incremental: false });

    const { db } = await openIndexDb(container, workspace);
    db.setUserVersion(SCHEMA_VERSION - 1); // simulate a tokenizer/schema bump

    const stats = await buildIndex(container, workspace); // incremental: true (default)

    // Every note re-added from scratch, none "updated" — the reset wiped
    // `notes` first, so there was nothing to consider already-known.
    expect(stats).toEqual({ added: 2, updated: 0, removed: 0, total: 2 });
  });

  test("exclusion: dot-directories and workspace exclude entries are never indexed", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under(".obsidian/Secret.md"), "# secret\n", 100);
    fs.seedFile(under("Archive/Old.md"), "# old\n", 100);
    fs.seedFile(under("_Worklogs/Not A Note.md"), "# not a note\n", 100);
    const container = makeTestContainer({ fs });

    const stats = await buildIndex(container, makeWorkspace(), { incremental: false });

    expect(stats).toEqual({ added: 1, updated: 0, removed: 0, total: 1 });
    const notes = await listNotes(container, makeWorkspace());
    expect(notes.map((note) => note.path)).toEqual(["A.md"]);
  });

  test("an exclude entry with surrounding slashes matches the same as without", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("Drafts/Skip.md"), "# skip\n", 100);
    const container = makeTestContainer({ fs });

    const stats = await buildIndex(container, makeWorkspace({ exclude: ["/Drafts/"] }), {
      incremental: false,
    });

    expect(stats.total).toBe(1);
  });

  test("a note file the filesystem refuses to read is skipped silently, not aborting the reindex", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    fs.seedFile(under("Broken.md"), "# will fail to read\n", 100);
    const brokenPath = under("Broken.md");
    const flakyFs: FileSystem = {
      ...fs,
      readFile: (path) => {
        if (path === brokenPath)
          return Promise.reject(new Error("simulated read failure"));
        return fs.readFile(path);
      },
    };
    const container = makeTestContainer({ fs: flakyFs });

    const stats = await buildIndex(container, makeWorkspace(), { incremental: false });

    // A parse failure skips the file silently; the reindex still succeeds
    // for everything else.
    expect(stats).toEqual({ added: 1, updated: 0, removed: 0, total: 1 });
    const notes = await listNotes(container, makeWorkspace());
    expect(notes.map((note) => note.path)).toEqual(["A.md"]);
  });

  test("a kb directory that does not exist on disk yields an empty (not throwing) build", async () => {
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ fs });

    const stats = await buildIndex(container, makeWorkspace(), { incremental: false });

    expect(stats).toEqual({ added: 0, updated: 0, removed: 0, total: 0 });
  });
});

describe("index/build buildIndex — worklogs (incremental by mtime)", () => {
  test("indexes worklog files under each non-dot worktree slug", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/STATE.md"), "# wt1\n## Current focus\nnothing\n", 100);
    fs.seedFile(
      underWorklogs("wt1/2026-01-01.md"),
      "## 10:00 — incident\n**Changes:** deployment rollback incident on the gateway.\n",
      100,
    );
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();

    await buildIndex(container, workspace, { incremental: false });

    const { db } = await openIndexDb(container, workspace);
    const rows = db.query<{ readonly slug: string; readonly date: string }>(
      "SELECT slug, date FROM worklog_fts ORDER BY date",
      [],
    );
    expect(rows).toEqual([
      { slug: "wt1", date: "2026-01-01" },
      { slug: "wt1", date: "STATE" },
    ]);
  });

  test("a dot-prefixed slug directory is skipped", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs(".hidden/2026-01-01.md"), "**Changes:** hidden.\n", 100);
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();

    await buildIndex(container, workspace, { incremental: false });

    const { db } = await openIndexDb(container, workspace);
    expect(db.query("SELECT * FROM worklog_fts", [])).toEqual([]);
  });

  test("an unchanged worklog file is NOT re-read on the next build", async () => {
    const fs = makeFsMemoryFake();
    const statePath = underWorklogs("wt1/STATE.md");
    fs.seedFile(statePath, "# wt1\n## Current focus\nnothing\n", 100);
    let readCount = 0;
    const countingFs: FileSystem = {
      ...fs,
      readFile: (path) => {
        if (path === statePath) readCount += 1;
        return fs.readFile(path);
      },
    };
    const container = makeTestContainer({ fs: countingFs });
    const workspace = makeWorkspace();
    await buildIndex(container, workspace, { incremental: false });
    expect(readCount).toBe(1);

    await buildIndex(container, workspace);

    expect(readCount).toBe(1); // still exactly one read — the second build skipped it
  });

  test("a changed worklog file IS re-read and its row updated", async () => {
    const fs = makeFsMemoryFake();
    const statePath = underWorklogs("wt1/STATE.md");
    fs.seedFile(statePath, "# wt1\n## Current focus\nnothing\n", 100);
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();
    await buildIndex(container, workspace, { incremental: false });

    fs.seedFile(statePath, "# wt1\n## Current focus\nnew focus\n", 200);
    await buildIndex(container, workspace);

    const { db } = await openIndexDb(container, workspace);
    const rows = db.query<{ readonly body: string }>("SELECT body FROM worklog_fts", []);
    expect(rows).toEqual([{ body: "# wt1\n## Current focus\nnew focus\n" }]);
  });

  test("a worklog file deleted from disk is pruned from worklog_files and worklog_fts", async () => {
    const fs = makeFsMemoryFake();
    const statePath = underWorklogs("wt1/STATE.md");
    fs.seedFile(statePath, "# wt1\n## Current focus\nnothing\n", 100);
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();
    await buildIndex(container, workspace, { incremental: false });

    await fs.remove(statePath);
    await buildIndex(container, workspace);

    const { db } = await openIndexDb(container, workspace);
    expect(db.query("SELECT * FROM worklog_fts", [])).toEqual([]);
    expect(db.query("SELECT * FROM worklog_files", [])).toEqual([]);
  });

  test("a worklogs root that does not exist on disk yields no worklog rows", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(under("A.md"), NOTE_A, 100);
    const container = makeTestContainer({ fs });
    const workspace = makeWorkspace();

    await buildIndex(container, workspace, { incremental: false });

    const { db } = await openIndexDb(container, workspace);
    expect(db.query("SELECT * FROM worklog_fts", [])).toEqual([]);
  });
});
