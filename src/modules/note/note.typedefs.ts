/** Path is relative to the workspace's `kb`, WITH the `.md` extension kept (unlike
 * `relKey`, which strips it). */
export type NoteSummary = {
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
};

/** `memory reindex` prints these fields verbatim, so their names and shape are
 * part of that output. */
export type BuildStats = {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly total: number;
};
