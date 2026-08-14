import { orderedTerms, salientTokens } from "./tokenize.ts";

/** NEAR proximity window, in tokens (`index.py:244`). */
export const PHRASE_WINDOW = 8;

const MAX_QUERY_TOKENS = 32;
const MAX_NEAR_CLAUSES = 24;

/**
 * Build a safe FTS5 MATCH query: an OR over up to 32 sorted, quoted salient
 * tokens (`index.py:237-239`). `query` is always natural text run through this —
 * never raw FTS5 syntax — so a prompt containing `OR`/`AND`/`NEAR`/quotes is safe
 * and never errors.
 */
export function ftsQuery(text: string): string {
  const tokens = [...salientTokens(text)].toSorted();
  return tokens
    .slice(0, MAX_QUERY_TOKENS)
    .map((token) => `"${token}"`)
    .join(" OR ");
}

/**
 * FTS5 `NEAR` clauses over adjacent salient-term pairs, OR'd together
 * (`index.py:262-275`). Rewards proximity ("salient tokens" as a phrase, not just
 * both words somewhere). Empty string when there are fewer than two ordered
 * terms — phrase ranking then degrades to pure BM25.
 */
export function phraseQuery(text: string, window: number = PHRASE_WINDOW): string {
  const terms = orderedTerms(text);
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
