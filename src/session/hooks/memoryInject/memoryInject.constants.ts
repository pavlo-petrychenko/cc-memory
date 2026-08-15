export const MIN_PROMPT_LENGTH = 12;
export const MIN_SALIENT_TOKENS = 2;
export const NOTES_POOL_SIZE = 8;
export const MAX_INJECTED_NOTES = 4;
export const MAX_INJECTED_WORKLOGS = 1;
export const MAX_LOGGED_PROMPT_LENGTH = 500;
export const MAX_LOGGED_TOKENS = 40;

// Size-capped rotation for `inject.jsonl`, reimplemented over the `FileSystem`
// port rather than reusing `logger.adapter.ts`'s `appendWithRotation`, which
// deliberately goes around that port so `Logger` diagnostics are never blocked by
// the seam they observe — this hook's own I/O should stay fake-testable instead.
export const MAX_INJECT_LOG_BYTES = 1_048_576;
export const KEPT_LOG_GENERATIONS = 2;
export const INJECT_LOG_FILENAME = "inject.jsonl";
