# retrieval

Tokenizing, query building, ranking, the per-workspace SQLite FTS5 index, and
the `search`/`notes`/`reindex` CLI commands.

- `query/` + `ranking/` — pure retrieval math, no database
- `store/` — the derived, disposable index (schema, connection, build,
  search, graph, note listing)
- `commands/` — the CLI subcommands, each with its own formatter: `notes`
  (enumerates via `store/noteList`, or raw JSON with `--json`), `reindex`
  (rebuilds via `store/indexBuild`, prints one +/~/- summary line per
  workspace in registry order), `search` (runs `store/search`'s fused
  retrieval, prints `(no hits)` when there are none)

`SearchKind`/`Hit`/`FusedHit` are the module's shared vocabulary
(`retrieval.typedefs.ts`); every submodule imports them from there, never
from a sibling's internals.

`query/tokenizer` turns prompt/note text into salient lowercased terms —
`salientTokens` (a set, for the FTS OR query) and `orderedTerms`
(sequence-preserving, for NEAR phrase pairs) — splitting compounds like
`overallScore` into both the glued form and the split parts, so a query in
either style retrieves notes written in the other. `query/ftsQuery` builds
the two FTS5 `MATCH` strings from that: an OR of quoted salient tokens, and
OR'd `NEAR` clauses over adjacent term pairs — text is always natural
language, never raw FTS5 syntax, so every token is quoted and a prompt
containing `OR`/`AND`/`NEAR`/quotes can never be misread as a query operator.
`ranking/`'s `fuse` combines the token-OR ranking with the phrase/`NEAR`
ranking plus a wikilink-corroboration bonus via Reciprocal Rank Fusion;
`applyScoreFloor` filters hits by raw BM25 strength.

`store/schema` owns the FTS5 DDL (`SCHEMA`) and its version stamp
(`SCHEMA_VERSION`) — the `porter unicode61` tokenizer and the
`notes_fts`/`worklog_fts` column order are load-bearing: `store/search`'s SQL
and column-weight positions (10/1/5 notes, 3/1/1 worklog) depend on them
exactly and must never drift apart. `store/connection` opens one workspace's
index database, one handle per process per path via `Container.openDatabase`,
and triggers a one-time full rebuild whenever the stored `PRAGMA user_version`
is behind `SCHEMA_VERSION` — every other `store/*` submodule reaches the
database only through here, never the container directly. `store/indexBuild`
walks a workspace's vault and `_Worklogs/`, upserting new/changed notes and
pruning anything no longer on disk — incremental by mtime by default, forced
full on a schema-version bump, and a malformed note or unreadable file is
skipped silently rather than aborting the whole reindex. `store/search` is
the two BM25 entry points — `search` (a single FTS5 MATCH) and `searchFused`
(token-OR + phrase/`NEAR` fused via `ranking/`'s RRF, plus `store/graph`'s
wikilink bonus). `store/graph` resolves a wikilink `dst` to a candidate by
relpath-minus-`.md` first, then by basename, and never counts a self-link.
`store/noteList` is an exhaustive, sorted enumeration of every indexed note —
unlike `store/search`'s BM25 queries, not recall-limited.
