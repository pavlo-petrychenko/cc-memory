export type InjectedHit = {
  readonly title: string;
  readonly snippet: string;
  /** Path relative to the workspace's `kb`/`worklogs` root, already computed by
   * the caller. */
  readonly relativePath: string;
};

export type InjectContextInput = {
  readonly workspaceId: string;
  readonly notes: readonly InjectedHit[];
  readonly worklogs: readonly InjectedHit[];
};

/** One entry of the candidate pool logged to `inject.jsonl`. */
export type CandidateLogEntry = { readonly p: string; readonly s: number };
