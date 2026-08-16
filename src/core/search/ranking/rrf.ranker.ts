import { RRF_K } from "@/core/search/ranking/ranking.constants.ts";
import type { FuseInput } from "@/core/search/search.typedefs.ts";
import type { FusedHit, Hit } from "@/core/search/search.typedefs.ts";

export class Ranker {
  /** RRF (C7): for each token hit at rank `i`, `s = 1/(RRF_K + i + 1)`; if it also
   * appears in the phrase results at rank `p`, `s += 1/(RRF_K + p + 1)`; then
   * `s += linkBoost * inlinkCount`. The original bm25 `score` is preserved — the
   * injection floor keys off it, not the fused `rankScore`. */
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

  /** Keeps only hits whose BM25 strength (`-score`; bm25 returns negative, lower is
   * stronger) clears `minScore`. */
  applyScoreFloor(hits: readonly Hit[], minScore: number): readonly Hit[] {
    return hits.filter((hit) => -hit.score >= minScore);
  }
}
