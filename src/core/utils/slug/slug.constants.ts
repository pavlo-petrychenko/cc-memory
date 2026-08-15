// Unicode-aware alphanumeric check (true for accented letters, digits in other
// scripts, etc.), not ASCII-only.
export const SLUG_ALLOWED_CHARACTER = /[\p{L}\p{N}_.-]/u;
