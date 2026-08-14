# ftsQuery

Builds the two SQLite FTS5 `MATCH` query strings from natural prompt text:
`ftsQuery` (an OR of quoted salient tokens) and `phraseQuery` (OR'd `NEAR`
clauses over adjacent term pairs).

`text` is always natural language, never raw FTS5 syntax — every token is
quoted, so a prompt containing `OR`/`AND`/`NEAR`/quotes can never be
misinterpreted as a query operator.
