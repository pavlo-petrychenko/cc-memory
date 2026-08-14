import type { SqlDatabase } from "../platform/database.typedefs.ts";

/**
 * The FTS5 index schema. The `porter unicode61` tokenizer and column order
 * on `notes_fts`/`worklog_fts` are load-bearing for retrieval and must not
 * drift from what `search.service.ts`'s SQL expects.
 *
 * `worklog_files` is what makes worklog indexing incremental-by-mtime
 * instead of a full `DELETE FROM worklog_fts` + reinsert on every
 * `SessionStart` (`build.service.ts`). `CREATE TABLE IF NOT EXISTS` is
 * additive-safe — an already-`SCHEMA_VERSION`-2 database picks it up on its
 * next open with no data loss, so this does not require bumping
 * `SCHEMA_VERSION`.
 */
export const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS worklog_files(
  id INTEGER PRIMARY KEY, path TEXT UNIQUE, mtime REAL
);
`;

/**
 * Bump when the FTS schema/tokenizer changes; `indexDb.service.ts`'s
 * `openIndexDb` detects a lower stored `PRAGMA user_version` and does a
 * one-time full rebuild — the DB is derived and disposable.
 */
export const SCHEMA_VERSION = 2;

/**
 * Drop our derived tables and recreate them at the current schema, then
 * stamp `PRAGMA user_version`. Safe: the markdown vault is the source of
 * truth, so `build.service.ts` repopulates from scratch.
 */
export function resetSchema(db: SqlDatabase): void {
  db.exec(
    "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; " +
      "DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS worklog_fts; " +
      "DROP TABLE IF EXISTS worklog_files;",
  );
  db.exec(SCHEMA);
  db.setUserVersion(SCHEMA_VERSION);
}
