import {
  MAX_NEAR_CLAUSES,
  MAX_QUERY_TOKENS,
  PHRASE_WINDOW,
} from "@/retrieval/query/ftsQuery/ftsQuery.constants.ts";
import { TokenizerParser } from "@/retrieval/query/tokenizer/tokenizer.parser.ts";

export class FtsQueryBuilder {
  constructor(private readonly tokenizerParser: TokenizerParser) {}

  /** Always natural prompt text, never raw FTS5 syntax, so quotes/`OR`/`AND`/`NEAR`
   * in the prompt are always safe. */
  ftsQuery(text: string): string {
    const tokens = [...this.tokenizerParser.salientTokens(text)].toSorted();
    return tokens
      .slice(0, MAX_QUERY_TOKENS)
      .map((token) => `"${token}"`)
      .join(" OR ");
  }

  /** FTS5 `NEAR` clauses over adjacent salient-term pairs, OR'd together. Empty
   * string when there are fewer than two ordered terms. */
  phraseQuery(text: string, window: number = PHRASE_WINDOW): string {
    const terms = this.tokenizerParser.orderedTerms(text);
    const seen = new Set<string>();
    const clauses: string[] = [];
    for (let index = 0; index < terms.length - 1; index += 1) {
      const first = terms[index];
      const second = terms[index + 1];
      if (first === undefined || second === undefined || first === second) continue;
      const clause = `NEAR("${first}" "${second}", ${window})`;
      if (!seen.has(clause)) {
        seen.add(clause);
        clauses.push(clause);
      }
    }
    return clauses.slice(0, MAX_NEAR_CLAUSES).join(" OR ");
  }
}
