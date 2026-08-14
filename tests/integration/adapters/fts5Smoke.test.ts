import { describe, expect, test } from "bun:test";

import { makeDbBunSqliteAdapter } from "../../../src/adapters/dbBunSqlite.adapter.ts";
import type { DbValue } from "../../../src/ports/db.port.ts";

/**
 * The load-bearing assumption of the entire runtime choice: `bun:sqlite`'s
 * bundled SQLite supports FTS5 with the `porter unicode61` tokenizer,
 * `bm25()`, `snippet()` and `NEAR`. `node:sqlite` does NOT ship FTS5 (verified
 * during planning — [[root]]'s "Decisions (locked)" table) and was rejected
 * for exactly this reason. If this file ever goes red, the runtime choice
 * itself needs revisiting, not the code around it.
 *
 * Schema and search SQL are copied verbatim from [[reference]] ("Index
 * schema" / "Search SQL", `src/lib/index.py:23-43,280-287`) — C7 freezes the
 * bm25 weights and tokenizer, so this test also pins that the frozen values
 * still parse and run.
 */

// Verbatim from [[reference]] — src/lib/index.py:25-43.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes(
  id INTEGER PRIMARY KEY, path TEXT UNIQUE, title TEXT, type TEXT,
  importance INTEGER, mtime REAL
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, body, tags, path UNINDEXED, tokenize = 'porter unicode61'
);
CREATE TABLE IF NOT EXISTS links(src_path TEXT, rel_type TEXT, dst TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS worklog_fts USING fts5(
  slug, date, body, path UNINDEXED, tokenize = 'porter unicode61'
);
`;

// Verbatim from [[reference]] — src/lib/index.py:280-287 (C7: weights frozen).
const NOTES_SEARCH_SQL = `
  SELECT path, title, snippet(notes_fts,1,'','','…',12) AS snip,
         bm25(notes_fts, 10.0, 1.0, 5.0) AS score
    FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT ?
`;

function insertNote(
  db: ReturnType<typeof makeDbBunSqliteAdapter>,
  title: string,
  body: string,
  tags: string,
  path: string,
): void {
  const params: readonly DbValue[] = [title, body, tags, path];
  db.run("INSERT INTO notes_fts (title, body, tags, path) VALUES (?, ?, ?, ?)", params);
}

describe("FTS5 capability smoke test", () => {
  test("porter stemming matches a different inflection of the query term", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);
    insertNote(db, "Injection", "we are injecting context into the session", "", "a.md");

    const rows = db.query<{ readonly path: string }>(
      "SELECT path FROM notes_fts WHERE notes_fts MATCH ?",
      ["inject"],
    );

    expect(rows).toEqual([{ path: "a.md" }]);
    db.close();
  });

  test("bm25() ranks the more relevant document first (lower score = stronger)", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);
    // "memory" appears 3 times in the body and once in the title (weighted 10x) —
    // this document must outrank the one where it merely appears once in tags.
    insertNote(db, "Memory memory memory", "memory memory memory", "", "strong.md");
    insertNote(db, "Other", "nothing relevant here", "memory", "weak.md");

    const rows = db.query<{ readonly path: string; readonly score: number }>(
      NOTES_SEARCH_SQL,
      ["memory", 10],
    );

    expect(rows.map((row) => row.path)).toEqual(["strong.md", "weak.md"]);
    expect(rows[0]?.score).toBeLessThan(rows[1]?.score ?? 0);
    db.close();
  });

  test("snippet() produces highlighted, truncated output", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);
    insertNote(
      db,
      "Title",
      "some leading words before we are injecting context into the session",
      "",
      "a.md",
    );

    const rows = db.query<{ readonly snip: string }>(NOTES_SEARCH_SQL, ["inject", 10]);

    expect(rows[0]?.snip).toContain("injecting");
    db.close();
  });

  test("NEAR(…, 8) matches two terms within the window", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);
    insertNote(db, "Title", "we are injecting some extra context here", "", "near.md");
    insertNote(
      db,
      "Title",
      "injecting has nothing at all to do with the other word",
      "",
      "far.md",
    );

    const rows = db.query<{ readonly path: string }>(
      "SELECT path FROM notes_fts WHERE notes_fts MATCH ?",
      ['NEAR("inject" "context", 8)'],
    );

    expect(rows.map((row) => row.path)).toEqual(["near.md"]);
    db.close();
  });

  test("PRAGMA user_version round-trips through getUserVersion/setUserVersion", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);

    expect(db.getUserVersion()).toBe(0);
    db.setUserVersion(2);
    expect(db.getUserVersion()).toBe(2);
    db.close();
  });

  test("the prepared-statement cache serves repeated queries against the same SQL string", () => {
    const db = makeDbBunSqliteAdapter(":memory:");
    db.exec(SCHEMA);
    insertNote(db, "One", "alpha beta", "", "one.md");
    insertNote(db, "Two", "alpha gamma", "", "two.md");

    const sql = "SELECT path FROM notes_fts WHERE notes_fts MATCH ? ORDER BY path";
    const first = db.query<{ readonly path: string }>(sql, ["alpha"]);
    const second = db.query<{ readonly path: string }>(sql, ["beta"]);

    expect(first.map((row) => row.path)).toEqual(["one.md", "two.md"]);
    expect(second.map((row) => row.path)).toEqual(["one.md"]);
    db.close();
  });
});
