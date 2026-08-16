export type InjectedHit = {
  readonly title: string;
  readonly snippet: string;
  /** Relative to the workspace's `kb`/`worklogs` root. */
  readonly relativePath: string;
};

export type InjectContextInput = {
  readonly workspaceId: string;
  readonly notes: readonly InjectedHit[];
  readonly worklogs: readonly InjectedHit[];
};

export type CandidateLogEntry = { readonly p: string; readonly s: number };
