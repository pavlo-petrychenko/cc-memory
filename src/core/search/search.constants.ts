// A raw word-chunk from arbitrary text (keeps underscores so we split them
// ourselves); CAMEL_SPLIT then breaks camelCase/acronym boundaries within a chunk.
export const CHUNK = /[A-Za-z0-9_]+/g;
export const CAMEL_SPLIT = /[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g;

export const PURE_DIGITS = /^\d+$/;

/** The stopword set excluded from salient tokens. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "you",
  "with",
  "that",
  "this",
  "have",
  "what",
  "how",
  "why",
  "can",
  "are",
  "was",
  "but",
  "not",
  "from",
  "your",
  "all",
  "any",
  "into",
  "out",
  "use",
  "using",
  "get",
  "got",
  "let",
  "lets",
]);

/** NEAR proximity window, in tokens. */
export const PHRASE_WINDOW = 8;

export const MAX_QUERY_TOKENS = 32;
export const MAX_NEAR_CLAUSES = 24;

/** Standard Reciprocal Rank Fusion constant. */
export const RRF_K = 60;
