# retrieval

Tokenizing, query building, ranking, the per-workspace SQLite FTS5 index, and
the `search`/`notes`/`reindex` CLI commands.

- `query/` + `ranking/` — pure retrieval math, no database
- `store/` — the derived, disposable index (schema, connection, build,
  search, graph, note listing)
- `commands/` — the CLI subcommands, each with its own formatter

`SearchKind`/`Hit`/`FusedHit` are the module's shared vocabulary
(`retrieval.typedefs.ts`); every submodule imports them from there, never
from a sibling's internals.
