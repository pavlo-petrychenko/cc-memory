/** Path is relative to the workspace's `kb`, WITH the `.md` extension kept (unlike
 * `relKey`, which strips it). */
export type NoteSummary = {
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
};
