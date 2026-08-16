import type { AbsPath } from "@/core/core.typedefs.ts";

/** `score` is the raw negative bm25 value from SQLite — lower is a stronger match;
 * "strength" is `-score`. */
export type Hit = {
  readonly path: AbsPath;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
};

/** A `Hit` after Reciprocal Rank Fusion, carrying the fused score. */
export type FusedHit = Hit & { readonly rankScore: number };

export type FuseInput = {
  /** BM25 token-OR hits, already ranked (0-based rank = array index) — the complete
   * candidate set, since phrase hits are always a subset of these. */
  readonly tokenHits: readonly Hit[];
  /** Path -> 0-based rank within the phrase/`NEAR` search results. */
  readonly phraseRanks: ReadonlyMap<string, number>;
  /** Path -> in-degree within the candidate set (`inlinkCounts`). */
  readonly inlinks: ReadonlyMap<string, number>;
  /** RRF bonus per corroborating in-link (`CCMEM_LINK_BOOST`, default `0.003`). */
  readonly linkBoost: number;
  readonly limit: number;
};
