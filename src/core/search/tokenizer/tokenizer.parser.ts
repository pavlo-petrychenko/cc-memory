/** Salient-token extraction for search queries. The `porter unicode61` FTS5
 * tokenizer splits `snake_case`/`kebab-case`/`dotted.names` at index time but
 * leaves `camelCase` glued, so a term like "overallScore" emits BOTH the glued
 * lowercase form and the camel-split parts — this symmetry is why `overallScore`
 * and `overall score` retrieve each other regardless of which form was written. */

import {
  CAMEL_SPLIT,
  CHUNK,
  PURE_DIGITS,
  STOPWORDS,
} from "@/core/search/tokenizer/tokenizer.constants.ts";

export class TokenizerParser {
  private keep(token: string): boolean {
    return token.length >= 2 && !PURE_DIGITS.test(token) && !STOPWORDS.has(token);
  }

  /** The glued lowercase form, plus every kept camel/underscore-split part. */
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

  salientTokens(text: string): ReadonlySet<string> {
    const tokens = new Set<string>();
    for (const match of text.matchAll(CHUNK)) {
      for (const token of this.subtokens(match[0])) tokens.add(token);
    }
    return tokens;
  }

  /** For building NEAR adjacency pairs. Unlike `salientTokens` (a set), this keeps
   * sequence: per chunk, the camel-split parts that pass `keep`, or the glued form
   * if none do. */
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
