# query

Turns natural prompt text into FTS5 query strings — no database, no I/O.

- `tokenizer/` — text → salient lowercased terms
- `ftsQuery/` — terms → the `MATCH` query strings (token-OR and phrase-`NEAR`)

Pure by construction: this is the retrieval math that needs no database.
