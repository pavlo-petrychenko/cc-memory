/** `git -C cwd rev-parse --show-toplevel`'s own timeout, distinct from the
 * general 5s read timeout below. */
export const SHOW_TOPLEVEL_TIMEOUT_MS = 3000;
/** Timeout for a read-only git command whose output the caller inspects. */
export const READ_TIMEOUT_MS = 5000;
/** Timeout for a git command that mutates the repo (`add`, `commit`). */
export const WRITE_TIMEOUT_MS = 10_000;
