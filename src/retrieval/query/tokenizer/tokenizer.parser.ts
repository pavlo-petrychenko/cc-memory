/**
 * Salient-token extraction for search queries.
 *
 * The vault's `porter unicode61` FTS5 tokenizer splits `snake_case`/`kebab-case`/
 * `dotted.names` at index time but leaves `camelCase` glued. So for a prompt like
 * "overallScore", we emit BOTH the glued lowercase form (`overallscore`, matches a
 * literal camelCase hit) AND the camel-split parts (`overall`, `score`, matches a
 * snake/kebab/spaced note) — this symmetry is why `overallScore` and
 * `overall score` retrieve each other regardless of which form the note was
 * written in.
 */

import {
  CAMEL_SPLIT,
  CHUNK,
  PURE_DIGITS,
  STOPWORDS,
} from "@/retrieval/query/tokenizer/tokenizer.constants.ts";

export class TokenizerParser {
  private keep(token: string): boolean {
    return token.length >= 2 && !PURE_DIGITS.test(token) && !STOPWORDS.has(token);
  }

  /**
   * Expand one raw word-chunk into FTS-matchable terms: the glued lowercase
   * form, plus every kept camel/underscore-split part.
   */
  subtokens(chunk: string): ReadonlySet<string> {
    const out = new Set<string>();
    const glued = chunk.replaceAll("_", "").toLowerCase();
    if (this.keep(glued)) out.add(glued);
    for (const match of chunk.matchAll(CAMEL_SPLIT)) {
      const part = match[0].toLowerCase();
      if (this.keep(part)) out.add(part);
    }
    return out;
  }

  /** Distinct lowercased query terms extracted from arbitrary prompt text. */
  salientTokens(text: string): ReadonlySet<string> {
    const tokens = new Set<string>();
    for (const match of text.matchAll(CHUNK)) {
      for (const token of this.subtokens(match[0])) tokens.add(token);
    }
    return tokens;
  }

  /**
   * Salient terms in prompt order, for building NEAR adjacency pairs. Unlike
   * `salientTokens` (a set), this keeps sequence and per-chunk sub-word order:
   * per chunk, the camel-split parts that pass `keep`; if none pass, the
   * glued form (if it passes `keep`).
   */
  orderedTerms(text: string): readonly string[] {
    const terms: string[] = [];
    for (const chunkMatch of text.matchAll(CHUNK)) {
      const chunk = chunkMatch[0];
      const parts: string[] = [];
      for (const camelMatch of chunk.matchAll(CAMEL_SPLIT)) {
        const part = camelMatch[0].toLowerCase();
        if (this.keep(part)) parts.push(part);
      }
      if (parts.length > 0) {
        terms.push(...parts);
        continue;
      }
      const glued = chunk.replaceAll("_", "").toLowerCase();
      if (this.keep(glued)) terms.push(glued);
    }
    return terms;
  }
}
