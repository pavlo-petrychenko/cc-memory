# schema

Owns the FTS5 index's DDL (`SCHEMA`), its version stamp (`SCHEMA_VERSION`),
and `resetSchema` — the one-time full rebuild a version bump triggers.

The `porter unicode61` tokenizer and the `notes_fts`/`worklog_fts` column
order here are load-bearing: `store/search/`'s SQL and column-weight
positions depend on them exactly.
