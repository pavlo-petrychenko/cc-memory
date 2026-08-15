export type FloorBlockInput = {
  readonly date: string;
  readonly reason: string;
  readonly branch: string;
  /** The last line of `git diff --stat`/`git diff --cached --stat` (whichever is
   * non-empty), already extracted by the caller; `""` when neither has output. */
  readonly uncommitted: string;
  /** Raw `git log -5 --oneline` output (already `.strip()`'d); `""` when empty. */
  readonly commits: string;
};
