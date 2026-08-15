/** The `porter unicode61` tokenizer and column order on `notes_fts`/`worklog_fts`
 * are load-bearing for retrieval (C7) and must not drift from what
 * `search.service.ts`'s SQL expects. */
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

/** Bump when the FTS schema/tokenizer changes; `connection.service.ts` detects a
 * lower stored `PRAGMA user_version` and does a one-time full rebuild. */
export const SCHEMA_VERSION = 2;
