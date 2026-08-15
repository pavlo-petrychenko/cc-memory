/**
 * `{added, updated, removed, total}` — the CLI's `memory reindex` prints
 * these fields verbatim, so their names and shape are part of that output.
 */
export type BuildStats = {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly total: number;
};

export type BuildOptions = {
  /** Skip a file whose stored mtime hasn't moved. Forced to `false` by a
   * schema-version bump regardless of what's passed here. */
  readonly incremental?: boolean;
};

/** Outcome of considering one walked note path for upsert — a closed set, so
 * an enum rather than a bare string literal union (CLAUDE.md's "no magic
 * strings" rule). */
export enum NoteUpsertOutcome {
  Added = "added",
  Updated = "updated",
  Skipped = "skipped",
}

export type UpsertedId = { readonly id: number };

export type ExistingWorklogFile = { readonly id: number; readonly mtime: number };
