# store

The SQLite FTS5 index for one workspace: derived and disposable, never the
source of truth (the vault is).

- `schema/` — the DDL and its version stamp
- `connection/` — opens/rebuilds one workspace's index database
- `indexBuild/` — walks the vault, upserts, prunes
- `search/` — BM25 + fused (RRF) retrieval
- `graph/` — wikilink neighbor/in-link queries
- `noteList/` — exhaustive note enumeration

Every submodule reaches the database only through `connection/`'s
`openIndexDb`, never by opening it directly.
