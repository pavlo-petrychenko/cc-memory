import {
  MAX_NEAR_CLAUSES,
  MAX_QUERY_TOKENS,
  PHRASE_WINDOW,
} from "@/retrieval/query/ftsQuery/ftsQuery.constants.ts";
import { TokenizerParser } from "@/retrieval/query/tokenizer/index.ts";

export class FtsQueryBuilder {
  constructor(
    private readonly tokenizerParser: TokenizerParser = new TokenizerParser(),
  ) {}

  /**
   * Build a safe FTS5 MATCH query: an OR over up to 32 sorted, quoted salient
   * tokens. `text` is always natural prompt text run through this — never raw
   * FTS5 syntax — so a prompt containing `OR`/`AND`/`NEAR`/quotes is safe and
   * never errors.
   */
  ftsQuery(text: string): string {
    const tokens = [...this.tokenizerParser.salientTokens(text)].toSorted();
    return tokens
      .slice(0, MAX_QUERY_TOKENS)
      .map((token) => `"${token}"`)
      .join(" OR ");
  }

  /**
   * FTS5 `NEAR` clauses over adjacent salient-term pairs, OR'd together.
   * Rewards proximity (salient tokens appearing as a phrase, not just both
   * words somewhere). Empty string when there are fewer than two ordered
   * terms — phrase ranking then degrades to pure BM25.
   */
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
