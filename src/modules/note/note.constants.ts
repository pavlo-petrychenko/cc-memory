// Anchored to true string-start (not just line-start), with DOTALL via
// `[\s\S]` so the block can span multiple lines.
export const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;
export const WIKILINK = /\[\[([^\]]+)\]\]/g;
export const TYPED_RELATION = /^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]/gm;
// `\w` in JS is always ASCII, which would truncate `#café` to "caf" — so the
// continuation class is spelled out with Unicode property escapes to accept
// non-ASCII letters after the first character. The first character stays
// `[A-Za-z]`, so `#привет` doesn't match at all.
export const INLINE_TAG = /(?:^|\s)#([A-Za-z][\p{L}\p{N}_/-]*)/gu;
export const TITLE = /^#\s+(.+?)\s*$/m;
export const KB_INDEX_TITLE_SUFFIX = /\s*[—-]\s*Knowledge Base Index\s*$/;

export const INDEX_NOTE_DESCRIPTION_MAX_LENGTH = 200;

// A top-level `.md` file matching this is a dated journal entry, excluded
// from "loose top-level notes".
export const DAILY_JOURNAL_FILENAME = /^\d{4}-\d{2}-\d{2}\.md$/;

export const MARKDOWN_EXTENSION = ".md";

/** Column weights (C7): title ×10, body ×1, tags ×5. */
export const NOTE_BM25_WEIGHTS = [10, 1, 5] as const;
