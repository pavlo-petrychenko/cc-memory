/** The `porter unicode61` tokenizer and column order on `notes_fts`/`worklog_fts`
 * are load-bearing for retrieval (C7) and must not drift from what the query
 * templates expect. */
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

/** Bump when the FTS schema/tokenizer changes; the adapter detects a lower stored
 * `PRAGMA user_version` and does a one-time full rebuild. */
export const SCHEMA_VERSION = 2;

/** `{WEIGHTS}` is replaced by the caller-supplied bm25 column weights, rendered as
 * `10.0, 1.0, 5.0`-style decimals — the weights themselves are contract C7 and
 * live in each entity module, not here. */
export const WEIGHTS_PLACEHOLDER = "{WEIGHTS}";

export const NOTES_SEARCH_TEMPLATE =
  "SELECT path, title, snippet(notes_fts,1,'','','…',12) AS snip, " +
  `bm25(notes_fts, ${WEIGHTS_PLACEHOLDER}) AS score FROM notes_fts ` +
  "WHERE notes_fts MATCH ? ORDER BY score LIMIT ?";

export const WORKLOG_SEARCH_TEMPLATE =
  "SELECT path, slug AS title, snippet(worklog_fts,2,'','','…',12) AS snip, " +
  `bm25(worklog_fts, ${WEIGHTS_PLACEHOLDER}) AS score FROM worklog_fts ` +
  "WHERE worklog_fts MATCH ? ORDER BY score LIMIT ?";
