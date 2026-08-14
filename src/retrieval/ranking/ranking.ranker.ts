import { RRF_K } from "@/retrieval/ranking/ranking.constants.ts";
import type { FuseInput } from "@/retrieval/ranking/ranking.typedefs.ts";
import type { FusedHit, Hit } from "@/retrieval/retrieval.typedefs.ts";

export class Ranker {
  /**
   * Reciprocal Rank Fusion of a token-OR ranking with a phrase/`NEAR` ranking,
   * plus a small wikilink-corroboration bonus. Pure so it's testable without a
   * database. For each token hit at rank `i`: `s = 1/(RRF_K + i + 1)`; if it
   * also appears in the phrase results at rank `p`, `s += 1/(RRF_K + p + 1)`;
   * then `s += linkBoost * inlinkCount`. Sorted by `-s`, truncated to `limit`.
   * The original bm25 `score` is preserved on each hit — the injection floor
   * keys off it, not the fused `rankScore`.
   */
  fuse(input: FuseInput): readonly FusedHit[] {
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
   * Keep only hits whose BM25 strength (`-score`; bm25 returns negative, lower
   * is stronger) clears `minScore`. `CCMEM_INJECT_MIN_SCORE` defaults to
   * `0.2`; `0` injects any match.
   */
  applyScoreFloor(hits: readonly Hit[], minScore: number): readonly Hit[] {
    return hits.filter((hit) => -hit.score >= minScore);
  }
}
