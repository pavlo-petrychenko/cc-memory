/** The state-file key used when `session_id` is absent from the payload. */
export const DEFAULT_SESSION_ID = "nosession";
/** How many leading characters of a git HEAD sha are kept in a signature. */
export const HEAD_LENGTH = 12;
/** Stands in for HEAD when `git rev-parse` returns nothing (no commits/no git). */
export const NO_GIT_HEAD = "nogit";
/** Filename of the shared wrap-gate state, one per workspace, beside its index db. */
export const WRAP_STATE_FILENAME = "wrap-state.json";
/** Entries older than this are pruned from the state file on every write. */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
