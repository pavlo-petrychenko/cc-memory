import type { AbsPath } from "../core/AbsPath.ts";

/**
 * One BM25 search result row, exactly as `index._run` shapes it
 * (`lib/index.py:301-302`). `score` is the raw negative bm25 value from SQLite —
 * lower is a stronger match; "strength" is `-score`.
 */
export type Hit = {
  readonly path: AbsPath;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
};

/** A `Hit` after Reciprocal Rank Fusion (`rank.fuse`), carrying the fused score. */
export type FusedHit = Hit & { readonly rankScore: number };
