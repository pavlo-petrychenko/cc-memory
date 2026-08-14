import type { Hit } from "@/retrieval/retrieval.typedefs.ts";

export type FuseInput = {
  /** BM25 token-OR hits, already ranked (0-based rank = array index). The
   * complete candidate set: phrase hits are always a subset of these (`NEAR`
   * requires both terms to already match), so an empty `tokenHits` fuses to `[]`. */
  readonly tokenHits: readonly Hit[];
  /** Path -> 0-based rank within the phrase/`NEAR` search results. */
  readonly phraseRanks: ReadonlyMap<string, number>;
  /** Path -> in-degree within the candidate set (`inlinkCounts`). */
  readonly inlinks: ReadonlyMap<string, number>;
  /** RRF bonus per corroborating in-link (`CCMEM_LINK_BOOST`, default `0.003`). */
  readonly linkBoost: number;
  readonly limit: number;
};
