/** Below this length, a prompt is too short to search on. */
export const MIN_PROMPT_LENGTH = 12;
/** Below this many salient (non-stopword) tokens, a prompt is too vague to search on. */
export const MIN_SALIENT_TOKENS = 2;
/** How many candidate notes are pulled per search before filtering by score. */
export const NOTES_POOL_SIZE = 8;
/** The most notes ever injected into one prompt. */
export const MAX_INJECTED_NOTES = 4;
/** The most worklog entries ever injected into one prompt. */
export const MAX_INJECTED_WORKLOGS = 1;
/** A logged prompt is truncated to this many characters. */
export const MAX_LOGGED_PROMPT_LENGTH = 500;
/** A logged token list is truncated to this many entries. */
export const MAX_LOGGED_TOKENS = 40;

// Size-capped rotation for `inject.jsonl`, same 1 MiB / keep-2 policy as
// `logger.adapter.ts`'s `appendWithRotation`, reimplemented over
// the `FileSystem` port instead of reusing that function directly:
// `appendWithRotation` goes around the port (real node:fs) specifically so
// `Logger` diagnostics can never be blocked by the very seam they're meant to
// observe — but this hook's own I/O should stay fake-testable like every
// other read/write here, so it goes through `FileSystem` instead.
/** The candidate log rotates once it would grow past this many bytes. */
export const MAX_INJECT_LOG_BYTES = 1_048_576;
/** How many rotated generations of the candidate log are kept. */
export const KEPT_LOG_GENERATIONS = 2;
/** Filename of the candidate log, one per workspace, beside its index db. */
export const INJECT_LOG_FILENAME = "inject.jsonl";
