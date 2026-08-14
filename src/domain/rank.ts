import type { FusedHit, Hit } from "./Hit.ts";

/** Standard Reciprocal Rank Fusion constant (`index.py:242`). */
export const RRF_K = 60;

export type FuseInput = {
  /** BM25 token-OR hits, already ranked (0-based rank = array index). The
   * complete candidate set: phrase hits are always a subset of these (`NEAR`
   * requires both terms to already match), so an empty `tokenHits` fuses to `[]`. */
  readonly tokenHits: readonly Hit[];
  /** Path -> 0-based rank within the phrase/`NEAR` search results. */
  readonly phraseRanks: ReadonlyMap<string, number>;
  /** Path -> in-degree within the candidate set (`index._inlink_counts`). */
  readonly inlinks: ReadonlyMap<string, number>;
  /** RRF bonus per corroborating in-link (`CCMEM_LINK_BOOST`, default `0.003`). */
  readonly linkBoost: number;
  readonly limit: number;
};

/**
 * Reciprocal Rank Fusion of a token-OR ranking with a phrase/`NEAR` ranking, plus
 * a small wikilink-corroboration bonus — the fusion math welded into
 * `index.search_fused` (`index.py:312-336`), extracted so it's testable without a
 * database. For each token hit at rank `i`: `s = 1/(RRF_K + i + 1)`; if it also
 * appears in the phrase results at rank `p`, `s += 1/(RRF_K + p + 1)`; then
 * `s += linkBoost * inlinkCount`. Sorted by `-s`, truncated to `limit`. The
 * original bm25 `score` is preserved on each hit — the injection floor keys off
 * it, not the fused `rankScore`.
 */
export function fuse(input: FuseInput): readonly FusedHit[] {
  const fused = input.tokenHits.map((hit, index) => {
    let score = 1 / (RRF_K + index + 1);
    const phraseRank = input.phraseRanks.get(hit.path);
    if (phraseRank !== undefined) {
      score += 1 / (RRF_K + phraseRank + 1);
    }
    score += input.linkBoost * (input.inlinks.get(hit.path) ?? 0);
    return { ...hit, rankScore: score };
  });
  return fused
    .toSorted((left, right) => right.rankScore - left.rankScore)
    .slice(0, input.limit);
}

/**
 * Keep only hits whose BM25 strength (`-score`; bm25 returns negative, lower is
 * stronger) clears `minScore` (`memory-inject.py:78-79`). `CCMEM_INJECT_MIN_SCORE`
 * defaults to `0.2`; `0` injects any match (the pre-floor behavior).
 */
export function applyScoreFloor(hits: readonly Hit[], minScore: number): readonly Hit[] {
  return hits.filter((hit) => -hit.score >= minScore);
}
