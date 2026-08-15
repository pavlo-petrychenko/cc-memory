import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { Ranker } from "@/core/search/rrf.ranker.ts";
import { RRF_K } from "@/core/search/search.constants.ts";
import type { Hit } from "@/core/search/search.typedefs.ts";

// Test-only helper. These paths never touch a real filesystem — `rank` only
// ever compares them for equality — so a literal string stands in for a real
// `expandPath` result without the AbsPath brand meaning anything here.
function toAbsPath(path: string): AbsPath {
  // SAFETY: see the module comment above — test fixture only, never a real path.
  return path as AbsPath;
}

function hit(path: string, score: number): Hit {
  return { path: toAbsPath(path), title: path, snippet: "…", score };
}

const ranker = new Ranker();

describe("RRF_K", () => {
  test("is the standard RRF constant", () => {
    expect(RRF_K).toBe(60);
  });
});

describe("Ranker.fuse", () => {
  test("token-only hits get the plain 1/(k+i+1) RRF score", () => {
    const fused = ranker.fuse({
      tokenHits: [hit("/a", -5), hit("/b", -3)],
      phraseRanks: new Map(),
      inlinks: new Map(),
      linkBoost: 0.003,
      limit: 5,
    });
    expect(fused[0]?.rankScore).toBeCloseTo(1 / 61);
    expect(fused[1]?.rankScore).toBeCloseTo(1 / 62);
  });

  test("a phrase-rank match adds the phrase RRF term", () => {
    const fused = ranker.fuse({
      tokenHits: [hit("/a", -5), hit("/b", -3)],
      phraseRanks: new Map([["/b", 0]]),
      inlinks: new Map(),
      linkBoost: 0.003,
      limit: 5,
    });
    // "/b" is token rank 1 (score 1/62) plus phrase rank 0 (1/61) -> now
    // outranks "/a", which only ever had the token-only score.
    const byPath = new Map(fused.map((entry) => [entry.path, entry.rankScore]));
    expect(byPath.get(toAbsPath("/b"))).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused[0]?.path).toBe(toAbsPath("/b"));
  });

  test("inlinks add linkBoost per corroborating in-link", () => {
    const fused = ranker.fuse({
      tokenHits: [hit("/a", -5)],
      phraseRanks: new Map(),
      inlinks: new Map([["/a", 3]]),
      linkBoost: 0.003,
      limit: 5,
    });
    expect(fused[0]?.rankScore).toBeCloseTo(1 / 61 + 0.003 * 3);
  });

  test("preserves the original bm25 score on each fused hit", () => {
    const fused = ranker.fuse({
      tokenHits: [hit("/a", -5)],
      phraseRanks: new Map(),
      inlinks: new Map(),
      linkBoost: 0.003,
      limit: 5,
    });
    expect(fused[0]?.score).toBe(-5);
  });

  test("sorts descending by fused score and truncates to limit", () => {
    const fused = ranker.fuse({
      tokenHits: [hit("/low", -1), hit("/high", -9)],
      phraseRanks: new Map([["/low", 0]]),
      inlinks: new Map(),
      linkBoost: 0.003,
      limit: 1,
    });
    expect(fused).toHaveLength(1);
    expect(fused[0]?.path).toBe(toAbsPath("/low"));
  });

  test("no token hits fuses to an empty array", () => {
    expect(
      ranker.fuse({
        tokenHits: [],
        phraseRanks: new Map(),
        inlinks: new Map(),
        linkBoost: 0.003,
        limit: 5,
      }),
    ).toEqual([]);
  });
});

describe("Ranker.applyScoreFloor", () => {
  // bm25 returns a negative score; "strength" is -score.
  test("keeps a hit whose strength clears the floor", () => {
    expect(ranker.applyScoreFloor([hit("/a", -5)], 0.2)).toEqual([hit("/a", -5)]);
  });

  test("drops a hit whose strength is below the floor", () => {
    expect(ranker.applyScoreFloor([hit("/a", -0.05)], 0.2)).toEqual([]);
  });

  test("a floor of 0 keeps every match", () => {
    expect(ranker.applyScoreFloor([hit("/a", -0.0001)], 0)).toEqual([hit("/a", -0.0001)]);
  });

  test("the boundary score exactly at the floor is kept (>=, not >)", () => {
    expect(ranker.applyScoreFloor([hit("/a", -0.2)], 0.2)).toEqual([hit("/a", -0.2)]);
  });
});
