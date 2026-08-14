export const DEFAULT_COMMIT_MESSAGE = "memory snapshot";

// Reuses the 10s timeout the other git write calls (`add`/`commit` in
// `git.adapter.ts`) use, rather than leaving these two subcommands unbounded.
export const GIT_TIMEOUT_MS = 10_000;
