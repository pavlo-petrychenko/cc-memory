/**
 * Salient-token extraction for search queries. Ported from `index.py:203-259`.
 *
 * The vault's `porter unicode61` FTS5 tokenizer splits `snake_case`/`kebab-case`/
 * `dotted.names` at index time but leaves `camelCase` glued. So for a prompt like
 * "overallScore", we emit BOTH the glued lowercase form (`overallscore`, matches a
 * literal camelCase hit) AND the camel-split parts (`overall`, `score`, matches a
 * snake/kebab/spaced note) — this symmetry is load-bearing (C7) and is why
 * `overallScore` and `overall score` retrieve each other regardless of which form
 * the note was written in.
 */

// A raw word-chunk from arbitrary text (keeps underscores so we split them
// ourselves); CAMEL_SPLIT then breaks camelCase/acronym boundaries within a chunk.
const CHUNK = /[A-Za-z0-9_]+/g;
const CAMEL_SPLIT = /[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g;

const PURE_DIGITS = /^\d+$/;

/** The 28-word stopword set (`index.py:203-205`) — copy verbatim, do not re-derive. */
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

function keep(token: string): boolean {
  return token.length >= 2 && !PURE_DIGITS.test(token) && !STOPWORDS.has(token);
}

/**
 * Expand one raw word-chunk into FTS-matchable terms: the glued lowercase form,
 * plus every kept camel/underscore-split part (`index.py:212-226`).
 */
export function subtokens(chunk: string): ReadonlySet<string> {
  const out = new Set<string>();
  const glued = chunk.replaceAll("_", "").toLowerCase();
  if (keep(glued)) out.add(glued);
  for (const match of chunk.matchAll(CAMEL_SPLIT)) {
    const part = match[0].toLowerCase();
    if (keep(part)) out.add(part);
  }
  return out;
}

/** Distinct lowercased query terms extracted from arbitrary prompt text (`index.py:229-234`). */
export function salientTokens(text: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(CHUNK)) {
    for (const token of subtokens(match[0])) tokens.add(token);
  }
  return tokens;
}

/**
 * Salient terms in prompt order, for building NEAR adjacency pairs
 * (`index.py:247-259`). Unlike `salientTokens` (a set), this keeps sequence and
 * per-chunk sub-word order: per chunk, the camel-split parts that pass `keep`; if
 * none pass, the glued form (if it passes `keep`).
 */
export function orderedTerms(text: string): readonly string[] {
  const terms: string[] = [];
  for (const chunkMatch of text.matchAll(CHUNK)) {
    const chunk = chunkMatch[0];
    const parts: string[] = [];
    for (const camelMatch of chunk.matchAll(CAMEL_SPLIT)) {
      const part = camelMatch[0].toLowerCase();
      if (keep(part)) parts.push(part);
    }
    if (parts.length > 0) {
      terms.push(...parts);
      continue;
    }
    const glued = chunk.replaceAll("_", "").toLowerCase();
    if (keep(glued)) terms.push(glued);
  }
  return terms;
}
