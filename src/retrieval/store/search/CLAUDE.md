# search

The two BM25 entry points: `search` (a single FTS5 MATCH) and `searchFused`
(token-OR + phrase/`NEAR` fused via `ranking/`'s RRF, plus `store/graph/`'s
wikilink bonus). `query`/`workspace` inputs are always natural text — never
raw FTS5 syntax — so any prompt is safe to search with.

Owns the two frozen per-kind SQL statements and their bm25 column weights
(10/1/5 notes, 3/1/1 worklog) — do not drift these from `store/schema/`.
