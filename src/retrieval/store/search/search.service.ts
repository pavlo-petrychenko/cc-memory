import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import type { SqlDatabase } from "@/platform/index.ts";
import { ftsQuery, phraseQuery } from "@/retrieval/query/index.ts";
import { fuse } from "@/retrieval/ranking/index.ts";
import { SearchKind, type FusedHit, type Hit } from "@/retrieval/retrieval.typedefs.ts";
import { openIndexDb } from "@/retrieval/store/connection/index.ts";
import { inlinkCounts } from "@/retrieval/store/graph/index.ts";
import {
  DEFAULT_KIND,
  DEFAULT_LIMIT,
  SEARCH_SQL,
} from "@/retrieval/store/search/search.constants.ts";
import type {
  SearchFusedOptions,
  SearchOptions,
  SearchRow,
} from "@/retrieval/store/search/search.typedefs.ts";

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
      // SAFETY: the `path` column is only ever written by
      // `indexBuild.service.ts`'s upserts, which always bind an
      // already-validated `AbsPath` — reading it back restores the brand
      // SQLite's storage necessarily erases.
      path: row.path as AbsPath,
      title: row.title,
      snippet: collapseWhitespace(row.snip),
      score: row.score,
    }));
  } catch {
    return [];
  }
}

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
