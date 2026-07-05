# cc-memory

Persistent, layered, **per-workspace** memory for Claude Code — built on plain
markdown vaults + a derived SQLite index + Claude Code hooks/skills. Local-first,
no vector DB, no cloud, no remote.

## Why

Claude Code starts every session cold. cc-memory gives it:

- **Knowledge base (long-term).** Durable, feature-level facts in an Obsidian-
  compatible markdown vault. Auto-indexed; the top-level map is injected at session
  start and relevant notes are auto-injected per prompt.
- **Working memory (short-term).** Per-worktree worklogs (`STATE.md` + a dated
  journal) so a session resumes with "what I was doing / what's open".
- **Consolidation.** A nightly reflector distils worklog `#promote` notes into
  proposed KB additions for your approval.
- **Isolation.** Everything is scoped to a **workspace** (resolved from cwd). A
  workspace-A session can't see workspace-B's knowledge.

## Architecture

```
WORKSPACE  (resolved from cwd via ~/.claude/memory/registry.toml, longest prefix)
├── Knowledge base   <kb> (an Obsidian vault)        long-term, shared
│     index: <id>/index.db (SQLite FTS5, OUTSIDE the vault, rebuildable)
└── Working memory   <kb>/_Worklogs/<worktree>/      short-term, per worktree
      STATE.md (living)  +  YYYY-MM-DD.md (journal)
```

- **Source of truth = markdown files** (git-versionable, Obsidian-editable).
- **Index = derived SQLite** (BM25 full-text + wikilink graph). Disposable;
  rebuild anytime with `memory reindex`. No embeddings (BM25 beats them on code at
  this scale); `sqlite-vec` is a future opt-in.

## Install

```sh
git clone <repo> ~/Documents/cc-memory   # or just have the folder
cd ~/Documents/cc-memory && ./install.sh
```

Idempotent. It symlinks the `memory` CLI onto your PATH, symlinks the skills into
`~/.claude/skills`, registers 5 hooks in `~/.claude/settings.json` (preserving your
existing hooks), seeds `~/.claude/memory/registry.toml`, and installs a launchd
agent for the nightly reflector.

Then add your workspaces (the installer seeds one example — edit or replace):

```sh
memory workspace add acme --match ~/code/acme --kb "~/Documents/Acme Vault"
```

## Components

| Piece | Type | Role |
|---|---|---|
| `session-start.py` | SessionStart hook | inject KB index + this worktree's `STATE.md`; incremental reindex |
| `memory-inject.py` | UserPromptSubmit hook | auto-inject top BM25 hits for the prompt (gated; chit-chat → nothing) |
| `wrap-gate.py` | Stop hook | remind/▢block to capture unsaved work via `remember` |
| `compact-checkpoint.py` | PostCompact hook | save the compaction summary into the worklog |
| `worklog-floor.py` | SessionEnd hook | deterministic git/command skeleton into the worklog (no commit) |
| `reflector.py` | launchd (nightly) | worklog `#promote`/Learned/Decided → **interactive tmux consolidation** session (`claude -p` + proposals file as `--headless` fallback) |
| `remember` | skill | write short-term working memory |
| `memory-search` | skill | fast BM25 search of the workspace KB |
| `save-learning` | skill | write durable KB notes (approval-gated) |
| `consolidate-review` | skill | apply approved reflector proposals |
| `manage-workspace` | skill | add/list/remove workspaces |

## CLI

```sh
memory resolve [cwd]            # which workspace + worktree a path maps to
memory workspace add|ls|rm      # manage workspaces
memory reindex [id] [--full]    # rebuild the search index
memory search "<query>" [-k N] [--worklog] [--workspace id]
memory reflect [--all] [--if-due]   # run consolidation (launchd uses --all --if-due)
memory commit [id] [-m msg]     # MANUAL git snapshot of a KB (local; no push)
memory doctor [--cwd ...]       # self-test hooks (read-only)
```

## Conventions

- **KB note** = atomic, one fact; `type: note` + `importance: 1-10`; full-path
  `[[wikilinks]]` (typed where useful: `- depends_on [[…]]`); reachable from its
  feature index note. Feature-specific, NEVER task-specific.
- **Worklog entry** = `**Changes/Learned/Decided/Open/Refs**`; tag durable lines
  `#promote` so the reflector promotes them.
- **Bi-temporal**: contradictions set `superseded_by` + `invalid_at`; never delete.

## Versioning

KB vaults are local git repos. **Nothing auto-commits.** Snapshot when you want:
`memory commit`. No remote/sync (a future, opt-in extension).

## Consolidation session

The reflector spawns a **detached tmux session** `cc-consolidate-<workspace>`
running interactive `claude --dangerously-skip-permissions` (so it runs unattended
without the trust/permission dialogs; its prompt still asks before KB writes).
Attach to watch/assist: `tmux attach -t cc-consolidate-<id>` (detach: Ctrl-b d).
Overrides: `CCMEM_CONSOLIDATE_CMD` (the command run in the pane; default
`claude --dangerously-skip-permissions`). Use `memory reflect --headless` to skip
tmux and produce a proposals file via `claude -p` instead.

## Tuning the wrap-gate

The Stop hook starts as a non-blocking nudge and only hard-blocks after repeated
stops with large drift. Env vars: `CCMEM_BLOCK_AFTER` (default 2),
`CCMEM_BLOCK_DRIFT` (default 5 files), `CCMEM_GATE_DISABLE=1` to disable blocking.

## Tuning retrieval

The index uses FTS5 **BM25 with Porter stemming** (so `inject` ↔ `injecting`) and
**column weights** (title/tags outrank body). Query tokens are compound-split
(`wrap-gate` → `wrap`, `gate`; `overallScore` → `overall`, `score`) so identifiers
match prose and vice-versa. Auto-injection then link-reranks the BM25 candidates
(a hit corroborated by another hit's `[[wikilink]]` gets a small boost) and applies
a relevance floor. Env vars:

- `CCMEM_INJECT_MIN_SCORE` (default `0.2`) — minimum BM25 strength to inject a hit;
  raise it if chit-chat pulls in weak notes, lower it if relevant notes get dropped.
- `CCMEM_LINK_BOOST` (default `0.5`) — strength added per corroborating in-link.
- `CCMEM_INJECT_LOG` — every prompt appends a row to
  `~/.claude/memory/<id>/inject.jsonl` (tokens, candidates + scores, what was
  injected) for calibrating the above. Set `CCMEM_INJECT_LOG=0` to disable.

A schema/tokenizer change bumps `index.SCHEMA_VERSION`; the next `build()` (every
SessionStart) does a one-time full rebuild automatically.

## Uninstall / disable

- Disable a hook: remove its entry from `~/.claude/settings.json`.
- Stop the reflector: `launchctl bootout gui/$(id -u)/dev.ccmemory.reflector`.
- Restore the pre-install save-learning: it's at
  `~/.claude/skills/save-learning.pre-ccmemory.bak`.

## Layout

```
cc-memory/
  install.sh  tools/install.py        # idempotent installer
  registry.example.toml
  src/lib/    resolve registry worklog index    # shared, stdlib-only
  src/bin/    memory  reflector.py
  src/hooks/  session-start worklog-floor wrap-gate compact-checkpoint memory-inject
  src/skills/ remember memory-search save-learning consolidate-review manage-workspace
  runners/    dev.ccmemory.reflector.plist
  docs/       design.md build-plan.md
```

See `docs/design.md` for the research and rationale behind every decision.
