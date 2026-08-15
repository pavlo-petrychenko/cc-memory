import { SearchKind } from "@/retrieval/retrieval.typedefs.ts";

// One SQL per kind. Column weights: notes = title 10 / body 1 / tags 5;
// worklog = slug 3 / date 1 / body 1. `snippet()` draws from the body column
// (index 1 for notes_fts, index 2 for worklog_fts).
// Exported individually (rather than kept as a private `Record`) so
// `platform/db/db.adapter.test.ts` can import the REAL,
// currently-running query text instead of keeping its own hand-copied
// transcription that could silently drift from this one.
export const NOTES_SEARCH_SQL =
  "SELECT path, title, snippet(notes_fts,1,'','','…',12) AS snip, " +
  "bm25(notes_fts, 10.0, 1.0, 5.0) AS score FROM notes_fts " +
  "WHERE notes_fts MATCH ? ORDER BY score LIMIT ?";
export const WORKLOG_SEARCH_SQL =
  "SELECT path, slug AS title, snippet(worklog_fts,2,'','','…',12) AS snip, " +
  "bm25(worklog_fts, 3.0, 1.0, 1.0) AS score FROM worklog_fts " +
  "WHERE worklog_fts MATCH ? ORDER BY score LIMIT ?";

export const SEARCH_SQL = {
  [SearchKind.Notes]: NOTES_SEARCH_SQL,
  [SearchKind.Worklog]: WORKLOG_SEARCH_SQL,
} satisfies Readonly<Record<SearchKind, string>>;

export const DEFAULT_LIMIT = 5;
export const DEFAULT_KIND = SearchKind.Notes;
