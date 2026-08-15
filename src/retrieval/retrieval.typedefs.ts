import type { AbsPath } from "@/core/index.ts";

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

/** The two indexed corpora a search can target — `notes_fts` (the vault) or
 * `worklog_fts` (recent worklogs). */
export enum SearchKind {
  Notes = "notes",
  Worklog = "worklog",
}
