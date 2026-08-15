import type { AbsPath } from "@/core/core.typedefs.ts";
import type { Workspace } from "@/core/domain.typedefs.ts";
import type { Hit } from "@/core/search/search.typedefs.ts";

/** The two indexed corpora. `Notes` maps to the `notes`/`notes_fts`/`links` tables,
 * `Worklog` to `worklog_fts`/`worklog_files`. */
export enum Collection {
  Notes = "notes",
  Worklog = "worklog",
}

/** A wikilink edge, as stored in the `links` table. */
export type Relation = {
  readonly relType: string;
  readonly dst: string;
};

/** A document ready to be projected into the index. Every collection reads the
 * fields it needs and ignores the rest, so one shape serves both. */
export type IndexDocument = {
  readonly path: AbsPath;
  readonly title: string;
  readonly body: string;
  readonly tags: string;
  readonly type: string;
  readonly importance: number | null;
  readonly relations: readonly Relation[];
  readonly slug: string;
  readonly date: string;
  readonly mtimeMs: number;
};

/** Ordered BM25 column weights, one per indexed column in the collection's FTS
 * table. `notes` is title/body/tags; `worklog` is slug/date/body. */
export type ColumnWeights = readonly number[];

/** Path → number of in-candidate links pointing at it, feeding the RRF
 * corroboration bonus. */
export type InlinkCounts = ReadonlyMap<AbsPath, number>;

/** A ranked full-text index over documents. Knows nothing about notes, worklogs or
 * markdown — a caller supplies the collection, the fields and the weights. */
export type SearchIndex = {
  /** Opens the workspace's index; if its stored schema version is behind the
   * current one, resets the tables and returns `true` (the caller must reproject
   * everything, ignoring any `incremental` intent). */
  readonly resetIfStale: (workspace: Workspace) => Promise<boolean>;
  /** Upserts `documents` into `collection`'s tables, replacing any previous rows
   * for the same path. */
  readonly project: (
    workspace: Workspace,
    collection: Collection,
    documents: readonly IndexDocument[],
  ) => Promise<void>;
  /** Deletes every row whose path is not in `keepPaths`. */
  readonly prune: (
    workspace: Workspace,
    collection: Collection,
    keepPaths: ReadonlySet<string>,
  ) => Promise<void>;
  /** Ranked BM25 query over `collection`, using `expression` as the FTS5 MATCH
   * string and `weights` as the bm25 column weights. */
  readonly query: (
    workspace: Workspace,
    collection: Collection,
    expression: string,
    weights: ColumnWeights,
    limit: number,
  ) => Promise<readonly Hit[]>;
  /** In-candidate link counts for `paths`, for the RRF corroboration bonus. */
  readonly neighbors: (
    workspace: Workspace,
    paths: readonly AbsPath[],
  ) => Promise<InlinkCounts>;
};
