import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import type { SqlDatabase } from "../platform/database.typedefs.ts";
import { inlinkCounts } from "./graph.service.ts";
import type { FusedHit, Hit } from "./Hit.ts";
import { openIndexDb } from "./indexDb.service.ts";
import { ftsQuery, phraseQuery } from "./query.ts";
import { fuse } from "./rank.ts";

/**
 * The two indexed corpora a search can target — `notes_fts` (the vault) or
 * `worklog_fts` (recent worklogs). A closed set, so an enum rather than a
 * bare string union.
 */
export enum SearchKind {
  Notes = "notes",
  Worklog = "worklog",
}

// One SQL per kind. Column weights: notes = title 10 / body 1 / tags 5;
// worklog = slug 3 / date 1 / body 1. `snippet()` draws from the body column
// (index 1 for notes_fts, index 2 for worklog_fts).
// Exported individually (rather than kept as a private `Record`) so
// `tests/integration/adapters/fts5Smoke.test.ts` can import the REAL,
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

const SEARCH_SQL = {
  [SearchKind.Notes]: NOTES_SEARCH_SQL,
  [SearchKind.Worklog]: WORKLOG_SEARCH_SQL,
} satisfies Readonly<Record<SearchKind, string>>;

const DEFAULT_LIMIT = 5;
const DEFAULT_KIND = SearchKind.Notes;

type SearchRow = {
  readonly path: string;
  readonly title: string;
  readonly snip: string;
  readonly score: number;
};

/** Collapses any run of whitespace to a single space and trims leading/
 * trailing empty tokens. */
function collapseWhitespace(text: string): string {
  return text
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .join(" ");
}

/**
 * Execute one prebuilt FTS5 MATCH. An empty (or all-whitespace) query
 * short-circuits to `[]` without touching the database; an FTS5 syntax
 * error is swallowed to `[]` rather than thrown — this is what makes a
 * natural prompt containing `OR`/`AND`/`NEAR`/quotes always safe to search
 * with.
 */
function runMatch(
  db: SqlDatabase,
  matchQuery: string,
  limit: number,
  kind: SearchKind,
): readonly Hit[] {
  if (matchQuery.trim() === "") return [];
  try {
    const rows = db.query<SearchRow>(SEARCH_SQL[kind], [matchQuery, limit]);
    return rows.map((row) => ({
      // SAFETY: the `path` column is only ever written by `build.service.ts`'s
      // upserts, which always bind an already-validated `AbsPath` — reading
      // it back restores the brand SQLite's storage necessarily erases.
      path: row.path as AbsPath,
      title: row.title,
      snippet: collapseWhitespace(row.snip),
      score: row.score,
    }));
  } catch {
    return [];
  }
}

export type SearchOptions = {
  readonly limit?: number;
  readonly kind?: SearchKind;
};

/**
 * Single BM25 query over one workspace. `query` is natural text: it is
 * always tokenized via `ftsQuery` and never interpreted as raw FTS5 syntax,
 * so any prompt (including one containing `OR`/`AND`/`NEAR`/quotes) is safe
 * and never errors.
 */
export async function search(
  container: Container,
  workspace: Workspace,
  query: string,
  options: SearchOptions = {},
): Promise<readonly Hit[]> {
  const { db } = await openIndexDb(container, workspace);
  return runMatch(
    db,
    ftsQuery(query),
    options.limit ?? DEFAULT_LIMIT,
    options.kind ?? DEFAULT_KIND,
  );
}

export type SearchFusedOptions = SearchOptions & {
  /** Include the wikilink-corroboration bonus. Default `true`. */
  readonly links?: boolean;
  /** RRF bonus per corroborating in-link — `Config.linkBoost`
   * (`CCMEM_LINK_BOOST`). Required rather than defaulted here: the default
   * (`0.003`) is `core/Config.ts`'s to own, not re-derived in this file. */
  readonly linkBoost: number;
};

/**
 * Proximity-aware retrieval: fuse a token-OR ranking with a phrase/`NEAR`
 * ranking via Reciprocal Rank Fusion, plus the small wikilink-corroboration
 * bonus. Returns `[]` EARLY when the token query yields no candidates at
 * all — phrase hits are always a subset of token hits (`NEAR` requires both
 * terms to already match), so the token list is the complete candidate set.
 * Degrades to pure BM25 ordering when `phraseQuery` has no adjacent-term
 * pair to build a `NEAR` clause from.
 *
 * Reuses the SAME `SqlDatabase` handle for the token search, the phrase search and
 * the in-link count (via `openIndexDb`/`Container.openDatabase`'s per-path
 * memoization) instead of opening three separate connections.
 */
export async function searchFused(
  container: Container,
  workspace: Workspace,
  query: string,
  options: SearchFusedOptions,
): Promise<readonly FusedHit[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const kind = options.kind ?? DEFAULT_KIND;
  const links = options.links ?? true;
  const pool = Math.max(limit * 3, 10); // candidate pool size before fusion

  const { db } = await openIndexDb(container, workspace);
  const tokenHits = runMatch(db, ftsQuery(query), pool, kind);
  if (tokenHits.length === 0) return [];

  const phraseHits = runMatch(db, phraseQuery(query), pool, kind);
  const phraseRanks = new Map(phraseHits.map((hit, index) => [hit.path, index]));
  const inlinks = links
    ? await inlinkCounts(
        container,
        workspace,
        tokenHits.map((hit) => hit.path),
      )
    : new Map<AbsPath, number>();

  return fuse({ tokenHits, phraseRanks, inlinks, linkBoost: options.linkBoost, limit });
}
