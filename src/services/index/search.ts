import type { Container } from "../../container.ts";
import type { AbsPath } from "../../domain/AbsPath.ts";
import type { FusedHit, Hit } from "../../domain/Hit.ts";
import { ftsQuery, phraseQuery } from "../../domain/query.ts";
import { fuse } from "../../domain/rank.ts";
import type { Workspace } from "../../domain/Workspace.ts";
import type { Db } from "../../ports/db.port.ts";
import { openIndexDb } from "./db.ts";
import { inlinkCounts } from "./graph.ts";

/**
 * The two indexed corpora a search can target — `notes_fts` (the vault) or
 * `worklog_fts` (recent worklogs), `lib/index.py:280-287,305`. A closed set,
 * so an enum rather than the Python's bare `"notes"`/`"worklog"` strings
 * (CLAUDE.md's "no magic strings" rule) — the enum VALUES are still exactly
 * those strings, since `kind` never crosses an agent-visible boundary as JSON.
 */
export enum SearchKind {
  Notes = "notes",
  Worklog = "worklog",
}

// One SQL per kind, weights frozen by **C7** — verbatim from the plan's Porting
// Reference ("Search SQL", `lib/index.py:280-287`). Column weights: notes =
// title 10 / body 1 / tags 5; worklog = slug 3 / date 1 / body 1. `snippet()`
// draws from the body column (index 1 for notes_fts, index 2 for worklog_fts).
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

const DEFAULT_LIMIT = 5; // lib/index.py:305,312 — `search`/`search_fused`'s own default
const DEFAULT_KIND = SearchKind.Notes; // lib/index.py:305,312

type SearchRow = {
  readonly path: string;
  readonly title: string;
  readonly snip: string;
  readonly score: number;
};

/** `" ".join(snip.split())` (`lib/index.py:302`) — Python's argless `str.split()`
 * splits on any run of whitespace and drops empty tokens either side. */
function collapseWhitespace(text: string): string {
  return text
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .join(" ");
}

/**
 * Execute one prebuilt FTS5 MATCH (`lib/index.py:290-302`, `_run`). An empty
 * (or all-whitespace) query short-circuits to `[]` without touching the
 * database; an FTS5 syntax error is swallowed to `[]` rather than thrown
 * (`lib/index.py:297-298`) — this is what makes a natural prompt containing
 * `OR`/`AND`/`NEAR`/quotes always safe to search with.
 */
function runMatch(
  db: Db,
  matchQuery: string,
  limit: number,
  kind: SearchKind,
): readonly Hit[] {
  if (matchQuery.trim() === "") return [];
  try {
    const rows = db.query<SearchRow>(SEARCH_SQL[kind], [matchQuery, limit]);
    return rows.map((row) => ({
      // SAFETY: the `path` column is only ever written by `build.ts`'s
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
 * Single BM25 query over one workspace (`lib/index.py:305-309`). `query` is
 * natural text: it is always tokenized via `ftsQuery` and never interpreted as
 * raw FTS5 syntax, so any prompt (including one containing `OR`/`AND`/`NEAR`/
 * quotes) is safe and never errors.
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
  /** Include the wikilink-corroboration bonus (`lib/index.py:312`'s `links`
   * parameter). Default `true`. */
  readonly links?: boolean;
  /** RRF bonus per corroborating in-link — `Config.linkBoost`
   * (`CCMEM_LINK_BOOST`). Required rather than defaulted here: the C5 default
   * (`0.003`) is `domain/Config.ts`'s to own, not re-derived in this file. */
  readonly linkBoost: number;
};

/**
 * Proximity-aware retrieval: fuse a token-OR ranking with a phrase/`NEAR`
 * ranking via Reciprocal Rank Fusion, plus the small wikilink-corroboration
 * bonus (`lib/index.py:312-336`, `search_fused`). Returns `[]` EARLY when the
 * token query yields no candidates at all — phrase hits are always a subset of
 * token hits (`NEAR` requires both terms to already match), so the token list
 * is the complete candidate set. Degrades to pure BM25 ordering when
 * `phraseQuery` has no adjacent-term pair to build a `NEAR` clause from.
 *
 * Reuses the SAME `Db` handle for the token search, the phrase search and the
 * in-link count ([[bugfixes]] #6, via `openIndexDb`/`Container.openDb`'s
 * per-path memoization) instead of the PoC's three separate connections.
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
  const pool = Math.max(limit * 3, 10); // lib/index.py:319 — candidate pool size

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
