// Matches `logger.adapter.ts`'s private `MAX_LOG_BYTES` — that
// constant isn't exported (single call site there), so this is a linked
// duplicate rather than a new, independently-chosen threshold.
export const LOG_SIZE_WARNING_BYTES = 1_048_576;

export const CCMEM_LOG_HOME_RELATIVE_PATH = "~/.claude/memory/ccmem.log";
