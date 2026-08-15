export type WorkingMemoryInput = {
  readonly workspaceId: string;
  readonly slug: string;
  /** `STATE.md`'s raw content, or `null` when the worktree has none yet
   * (missing or unreadable file). */
  readonly state: string | null;
};
