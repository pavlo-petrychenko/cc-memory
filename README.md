# cc-memory

Persistent, layered, **per-workspace** memory for Claude Code and pi — plain
markdown vaults, a derived SQLite FTS5 index, five hooks and five skills.
Local-first: no vector DB, no cloud, no remote, no background process.

## Why

Claude Code starts every session cold. cc-memory gives it:

- **Knowledge base (long-term).** Durable, feature-level facts in an
  Obsidian-compatible markdown vault. Auto-indexed; the top-level map is injected at
  session start and relevant notes are auto-injected per prompt.
- **Working memory (short-term).** Per-worktree worklogs (`STATE.md` + a dated
  journal) so a session resumes with "what I was doing / what's open".
- **Isolation.** Everything is scoped to a **workspace**, resolved from cwd. A
  workspace-A session cannot see workspace-B's knowledge; outside every registered
  workspace there is no memory at all.

## Architecture

```
WORKSPACE  (resolved from cwd via ~/.claude/memory/registry.toml, longest prefix)
├── Knowledge base   <kb> (an Obsidian vault)        long-term, shared
│     index: ~/.claude/memory/<id>/index.db (SQLite FTS5, OUTSIDE the vault)
└── Working memory   <kb>/_Worklogs/<worktree>/      short-term, per worktree
      STATE.md (living)  +  YYYY-MM-DD.md (journal)
```

Two properties do most of the work:

- **Markdown files are the source of truth** — git-versionable, Obsidian-editable,
  readable without this tool.
- **The index is derived and disposable.** BM25 full-text plus the wikilink graph;
  rebuild it any time with `memory reindex`. No embeddings: queries here hinge on
  exact tokens — function names, flags, error strings — which BM25 matches and
  embeddings blur.

## Install

Requires [Bun](https://bun.com). Everything else is vendored or built from source.

```sh
git clone https://github.com/pavlo-petrychenko/cc-memory ~/Documents/cc-memory
cd ~/Documents/cc-memory && ./install.sh
```

Idempotent — re-run it after every `git pull`, since the installed shim and the
registered hooks point at `dist/memory.js` by absolute path. It builds the bundle,
writes a `memory` shim to `~/.local/bin`, symlinks the skills into
`~/.claude/skills` (backing up anything it replaces), registers the five hooks in
`~/.claude/settings.json` while preserving your existing ones, and seeds
`~/.claude/memory/registry.toml`.

`./install.sh --dry-run` prints the exact `settings.json` diff and writes nothing.
`memory uninstall` reverses precisely what was recorded in
`~/.claude/memory/installed.json`, and never touches your registry or vaults.

Then register a workspace (the installer seeds one example — edit or replace it):

```sh
memory workspace add acme --match ~/code/acme --kb "~/Documents/Acme Vault"
```

## Components

| Piece | Type | Role |
|---|---|---|
| `session-start` | SessionStart hook | inject the KB map + this worktree's `STATE.md`; incremental reindex |
| `memory-inject` | UserPromptSubmit hook | inject the top hits for the prompt (gated; chit-chat injects nothing) |
| `wrap-gate` | Stop hook | remind, then block, to capture unsaved work via `remember` |
| `compact-checkpoint` | PostCompact hook | save the compaction summary into the worklog |
| `worklog-floor` | SessionEnd hook | a deterministic git/command skeleton into the worklog (never commits) |
| `remember` | skill | write short-term working memory |
| `memory-search` | skill | BM25 search of the workspace KB |
| `save-learning` | skill | write durable KB notes (approval-gated) |
| `actualize-kb` | skill | audit KB notes against this session's changes → propose updates |
| `manage-workspace` | skill | add, list and remove workspaces |

## CLI

```sh
memory resolve [cwd]                        # which workspace + worktree a path maps to
memory workspace add|ls|rm                  # manage workspaces
memory reindex [workspace] [--full]         # rebuild the search index
memory search <query> [-k N] [--worklog] [--workspace ID]
memory notes [--folder F] [--json]          # enumerate KB notes (auditing)
memory commit [workspace] [-m MSG]          # MANUAL git snapshot of a KB (local; no push)
memory doctor [--cwd PATH] [--prompt TEXT]  # self-test hooks, diagnose the install
memory install [--dry-run] | uninstall
```

`memory hook <name>` is how Claude Code invokes the hooks; you never call it by hand.

## Conventions

- **KB note** — atomic, one fact; `type: note` plus `importance: 1-10`; full-path
  `[[wikilinks]]`, typed where useful (`- depends_on [[…]]`); reachable from its
  feature index note. Feature-specific, never task-specific.
- **Worklog entry** — `**Changes/Learned/Decided/Open/Refs**`. Tag durable lines
  `#promote` to mark them as KB candidates for a later `save-learning` pass.
- **Bi-temporal.** A contradiction sets `superseded_by` and `invalid_at`. Nothing is
  ever deleted.

## Versioning

KB vaults are local git repos. **Nothing auto-commits.** Snapshot when you want to:
`memory commit`. There is no remote and no sync.

## Tuning the wrap-gate

The Stop hook starts as a non-blocking nudge and only hard-blocks after repeated
stops with substantial uncommitted drift. `CCMEM_BLOCK_AFTER` (default 2),
`CCMEM_BLOCK_DRIFT` (default 5 files), `CCMEM_GATE_DISABLE=1` to never block.

## Tuning retrieval

The index uses FTS5 **BM25 with Porter stemming** (so `inject` matches `injecting`)
and **column weights**, so a title or tag outranks the same word in the body. Query
tokens are compound-split (`wrap-gate` → `wrap`, `gate`; `overallScore` → `overall`,
`score`) so identifiers match prose and vice versa. Retrieval then **fuses** a
token-OR ranking with a phrase/`NEAR` proximity ranking via **Reciprocal Rank
Fusion** (k=60), adds a small **wikilink-corroboration** bonus so a hit linked to by
another hit rises, and the auto-injection path applies a relevance floor.

- `CCMEM_INJECT_MIN_SCORE` (default `0.2`) — minimum strength to inject a hit. Raise
  it if chit-chat pulls in weak notes; lower it if relevant notes get dropped.
- `CCMEM_LINK_BOOST` (default `0.003`) — bonus per corroborating in-link.
- `CCMEM_INJECT_LOG` — every prompt appends a row to
  `~/.claude/memory/<id>/inject.jsonl` (tokens, candidates with scores, what was
  injected) for calibrating the two above. Set to `0` to disable.
- `CCMEM_LOG_LEVEL` — `debug` | `info` | `warn` | `error` (default `warn`).

A schema or tokenizer change bumps `SCHEMA_VERSION`, and the next SessionStart
rebuilds the index once, automatically.

## Development

```sh
bun install
bun run check     # format, lint, typecheck, the full test suite with coverage
bun test          # fast, no coverage
bun run build     # bundle to dist/memory.js
```

`CLAUDE.md` is the working agreement: module anatomy, the file-suffix taxonomy, what
"pure" means here, and the structural tests in `src/quality/` that enforce all of it.

## Layout

```
cc-memory/
  install.sh                 idempotent installer
  registry.example.toml      what `install` seeds when you have no registry
  src/
    core/       shared kernel — Result, AbsPath, Workspace, Config, path utils
    platform/   the only code that touches the outside world, one folder per port
    workspace/  the registry, cwd→workspace resolution, worktree slugs
    retrieval/  tokenizing, query building, ranking, the SQLite index, search
    knowledge/  vault notes: frontmatter/wikilink parsing, and the KB map
    worklog/    STATE.md and the dated journal
    session/    the five hooks and their shared fail-open runtime
    install/    wiring into Claude Code, and doctor
    cli/        arg parsing, dispatch, output
    skills/     the five skills the installer symlinks
    testing/    fakes, fixtures and goldens — imported only by tests
    quality/    tests that assert on the repo's own shape
  tools/oxlint/anti-slop/    the vendored lint rules
```
