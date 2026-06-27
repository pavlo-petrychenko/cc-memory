# Persistent, layered memory for Claude Code — shipped as `cc-memory`

## Context

Pavlo already has a solid **long-term** knowledge base: an Obsidian vault
(`~/Documents/Obsidian Vault`, ~81 atomic notes, one folder per feature, index
notes + full-path wikilinks), a `save-learning` skill (approval-gated write side),
and a `SessionStart` hook (`~/.claude/hooks/obsidian-kb-index.py`) that injects the
vault's top-level index when `cwd` is under `~/Desktop/project`.

Gaps (his list): **(1)** no enforcement that knowledge is captured — relies on the
agent remembering `save-learning`; **(3)** no short-term memory; **(5)** the start-up
index isn't scoped per worktree; **(7)** no distillation of short-term → KB. Plus he
wants **per-workspace isolation**, faster agent-oriented search, **the whole thing
as a shareable repo with one-line setup**, **git-versioned KBs**, and **consolidation
that still runs when the laptop was asleep at the scheduled time**.

**Outcome:** a layered memory system, packaged as the private repo
`~/Documents/cc-memory` with a one-line installer, that *extends* the existing setup:
- **Knowledge Base (KB)** — long-term semantic memory (the vault), now **git-versioned**.
- **Working memory (worklog)** — short-term episodic memory, **per worktree**, two
  files (living `STATE.md` + append-only dated journal).
- **Reflector** — local, launchd-driven (catch-up on wake) consolidation that
  proposes KB promotions for approval.
Driven by hooks + skills + CLAUDE.md, scoped by a **workspace registry**.

Detailed design + research rationale: `…/scratchpad/memory-system-design.md` and
`…/scratchpad/memory-build-plan.md` (to be moved into `cc-memory/docs/`).

## Locked decisions

- **Keep the vault + DIY retrieval** (borrow basic-memory's FTS5+sqlite-vec+RRF
  *pattern*, not the framework). **No vector DB now** — FTS5/BM25 + ripgrep + the
  wikilink graph suffices at this scale (BM25 beats embeddings on code).
- **Files are the source of truth; SQLite index is derived/disposable.**
- **Workspace** = top scope (replaces "project"). **One workspace = one KB = its
  own Obsidian vault = one index.** Soft isolation: cross-workspace data is
  structurally never read into a session.
- **Short-term = per-worktree two-file worklog** (`STATE.md` + `<date>.md`);
  `#promote` tags mark KB candidates.
- **Capture enforced by hooks**, not agent discipline. At wrap the agent
  self-authors its worklog **including a summary of all changes it made** (it holds
  the transcript → cheap, rich); a deterministic floor catches killed sessions.
- **KBs are git repos, LOCAL ONLY** for now — history/rollback, no remote, no sync.
  **Commits are manual/approval-gated (`memory commit`); nothing auto-commits.**
- **Reflector runs locally via launchd** with **catch-up + an idempotent
  "run-if-due" guard** (runs on next wake/login if the scheduled time was missed),
  using the local `claude -p`. **KB writes stay approval-gated.**
- **Ship as `~/Documents/cc-memory`** (private git repo) with a one-line installer;
  packaged for sharing (Claude Code plugin layout + `install.sh`).
- Registry format **TOML** (`tomllib` confirmed, Python 3.14). Hooks **fail open**.
- **Final step:** rename `~/Documents/Obsidian Vault` → `~/Documents/Mate Vault`.

## Architecture

```
WORKSPACE  "mate"   (resolved from cwd via registry, longest-prefix)
├── KNOWLEDGE BASE  (long-term, shared, git-versioned)   ~/Documents/Mate Vault
│     READ: scoped index on start + notes/search on demand
│     WRITE: save-learning (approval) + nightly Reflector (approval); auto-commit
└── WORKING MEMORY  (short-term, per worktree)            <kb>/_Worklogs/<slug>/
      STATE.md (living)  +  <date>.md (episodic journal)
      READ: STATE injected on start (this worktree only)
      WRITE: Stop-gate self-author (change summary) + PostCompact + SessionEnd floor
                          └── launchd Reflector (catch-up) → KB proposals (approval)
```

## Repository & distribution (`~/Documents/cc-memory`)

```
cc-memory/                       # private git repo; the single source of truth
  README.md                      # what it is, one-line setup, usage
  install.sh                     # idempotent one-line setup (see below)
  registry.example.toml          # template; real registry is user state in ~/.claude
  src/
    lib/{resolve,registry,worklog,index}.py   # shared; hooks add src/ to sys.path
    bin/{memory,reflector.py}                 # `memory` CLI + reflector
    hooks/{session-start,worklog-floor,wrap-gate,compact-checkpoint,memory-inject}.py
    skills/{remember,memory-search,consolidate-review,manage-workspace,save-learning}/SKILL.md
  runners/dev.ccmemory.reflector.plist        # launchd template
  docs/{design.md,architecture.md}            # the scratchpad design docs, moved in
```

`install.sh` (idempotent, the "one line"):
1. symlink `src/bin/memory` → `~/.local/bin/memory` (on PATH);
2. symlink each `src/skills/*` → `~/.claude/skills/*` (Claude Code skill discovery);
3. **merge** hook entries into `~/.claude/settings.json` pointing at the repo's
   `src/hooks/*.py` (SessionStart, SessionEnd, Stop, PostCompact, UserPromptSubmit)
   — without clobbering existing `buddy-reroll` SessionStart or the plan-review
   PreToolUse hook;
4. seed `~/.claude/memory/registry.toml` (machine-specific paths; **not** in the
   repo) with the `mate` entry if absent;
5. install + load the launchd reflector agent;
6. `git init` the repo if needed; print resolved paths + next steps.

Distribution: the `src/hooks` + `src/skills` layout doubles as a **Claude Code
plugin** for sharing; `install.sh` handles the runtime bits a plugin can't (registry,
vault `git init`, launchd). Plugin-manifest specifics confirmed during P0.

## Versioning (git, local-only)

- Each KB vault is a **git repo** (`git init` done by `memory workspace add`; `mate`
  initialized during migration). `.gitignore`: `.obsidian/workspace*`, `.obsidian/cache`,
  `.DS_Store`. The derived `index.db` lives **outside** the vault → never committed.
- **Commit policy: manual / approval-gated — NO automatic commits.** Hooks and
  skills only ever *write files*; they never `git commit`. You snapshot when you
  want via `memory commit [<workspace>] [-m msg]` (stages KB + worklogs, commits
  locally). No remote, no push.
- Gives free history, diff, rollback on demand, and is the substrate if remote/sync
  is added later (out of scope now).

## Conventions

### Where KBs live & encapsulation
**Default: one workspace = its own Obsidian vault** (separate dir → separate graph →
strongest isolation); the registry also supports a subfolder of a shared vault.
- `mate` keeps its existing vault (renamed to `~/Documents/Mate Vault` at the end).
- New workspaces default KB to `~/Documents/<Id> Vault/` (overridable).
- Worklogs (markdown) live **inside** the KB under `_Worklogs/`; `index.db` lives
  **outside**, in `~/.claude/memory/<id>/`.

**Encapsulation — structural, four guarantees:** (1) registry resolves `cwd` to
exactly one workspace (longest prefix; no match → no memory); (2) hooks open only
the resolved workspace's paths; (3) separate KB dirs ⇒ separate `index.db` ⇒ search
can't cross workspaces; (4) `memory workspace add` refuses overlapping `match`
prefixes / nested `kb`.

### Registry `~/.claude/memory/registry.toml` (user state; read by every hook)
```toml
[[workspace]]
id = "mate"
match = ["~/Desktop/project"]
kb = "~/Documents/Mate Vault"                  # renamed from "Obsidian Vault" (Phase R)
worklogs = "~/Documents/Mate Vault/_Worklogs"
exclude = ["_Worklogs", "Archive", ".obsidian"]
index_db = "~/.claude/memory/mate/index.db"    # derived, OUTSIDE the vault
```
- **Worktree slug** = `cwd` relative to the matched prefix, slashes→dashes.

### Adding a workspace — one command
`memory workspace add <id> --match <cwd-prefix>… [--kb <path>]`, plus a thin
**`manage-workspace` skill** for conversational use. It: validates (unique id,
non-overlapping match, non-nested kb) → scaffolds the KB vault (`git init`, minimal
`.obsidian/`, root index note) + `_Worklogs/` + `~/.claude/memory/<id>/` → appends
the registry block → builds the initial `index.db`. Also `workspace rm|ls`.

### Worklog files (under `<kb>/_Worklogs/<slug>/`)
- `STATE.md` — living: `## Current focus`, `## Open threads` (checkboxes),
  `## Working notes`. Injected on start.
- `<date>.md` — append-only, one entry per wrap, authored by the agent:
  `**Changes:**` (summary of ALL changes made this session — files, commits, PRs,
  config, migrations), `**Learned:**`, `**Decided:**`, `**Open:**`, `**Refs:**`;
  durable lines tagged `#promote`. SessionEnd appends a deterministic
  `<!-- auto: git diff --stat / branch / commands -->` line.

### Index `index.db` (one per workspace)
`notes(...)`, `notes_fts` (FTS5 BM25), `links(src,dst,rel_type)`, `worklog_fts`.
`vec` (sqlite-vec) deferred to Phase 5.

## Implementation phases

Order: **P0 → P1 → P3 → P2 → P4 → R → P5** (P3 independent of P2; P1 is the first
felt win; R = rename, done once everything is registry-driven and stable).

### P0 — Repo, foundation, workspace management (no session behavior change yet)
- Scaffold `~/Documents/cc-memory` (structure above) + `install.sh` + `README.md`;
  move the scratchpad design docs into `docs/`.
- `src/lib/`: `resolve(cwd)→workspace|None`, `slug()`, registry read/write + overlap
  validation, path helpers. **Every hook imports this** (no drift).
- `src/bin/memory` CLI: `workspace add|rm|ls` (incl. `git init`), `resolve`,
  `reindex [<id>]`, `reflect [--if-due]`, `doctor` (feeds synthetic hook JSON to
  each hook → test without a live session).
- `manage-workspace` skill.
- Seed `~/.claude/memory/registry.toml` with `mate` (still pointing at the current
  `~/Documents/Obsidian Vault` path until Phase R).
- **`mate` vault `git init`** (+ `.gitignore`) as the first versioning step.

### P1 — Working memory exists & loads on start  (closes gaps 3, 5)
- Worklog templates + **`remember` skill** (agent appends a dated entry + refreshes
  `STATE.md`, tags durable lines `#promote`).
- **Migrate** the existing `obsidian-kb-index.py` logic into `src/hooks/session-start.py`,
  made **registry-driven**: inject the resolved workspace's KB top-level index
  (excluding `exclude`) **+** this worktree's `STATE.md`/open threads. Repoint the
  settings.json SessionStart entry. **Must reproduce today's `mate` index output
  verbatim** (no regression).
- **SessionEnd hook** `worklog-floor.py`: deterministic git/command line into today's
  `<date>.md` (writes only — **no commit**).

### P2 — Enforcement: guaranteed capture + change summary  (closes gap 1)
- **Stop hook** `wrap-gate.py`: if git drift since last worklog update AND worklog
  not refreshed this session → `{"decision":"block","reason":"<write today's entry:
  a **summary of ALL changes you made** + Learned/Decided/Open, tag durable findings
  #promote; refresh STATE>"}`. Guard with `stop_hook_active` + per-session marker
  (`~/.claude/memory/<ws>/.wrap-<session_id>`) reset on new git activity → fires at
  most once per batch. **Start as a non-blocking nudge**, escalate to hard block only
  after N unsaved turns / large drift (tune live).
- **PostCompact hook** `compact-checkpoint.py`: append `compact_summary` to today's
  `<date>.md`.

### P3 — Retrieval: fast, automatic, isolated  (closes gap 2)
- `index.db` schema + `src/lib/index.py` **incremental indexer** (mtime-based; parse
  frontmatter + body + `[[wikilinks]]`). Runs on SessionStart (incremental), after
  save-learning, before reflector, and via `memory reindex`.
- **UserPromptSubmit hook** `memory-inject.py`: salient-token extraction → FTS5 MATCH
  → inject top 3–5 (capped, threshold-gated so chit-chat injects nothing).
- **`memory-search` skill**: FTS5 + 1-hop link expansion (+ optional rerank); returns
  ranked paths + snippets. Replaces the weak `obsidian search_notes`.

### P4 — Consolidation loop, reliable on a laptop  (closes gap 7)
- **Reflector** `src/bin/reflector.py` (per workspace; `claude -p` locally): gather
  `#promote`/Changes/Learned/Decided since last run → retrieve similar KB notes via
  `index.db` → decide **ADD/UPDATE/INVALIDATE/NOOP** → importance-filter (<4) +
  dedup → write `<kb>/_Worklogs/_proposals/<date>.md` (checklist + diffs + rationale).
  Reads worklogs only.
- **Reliability:** a **launchd LaunchAgent** (`runners/dev.ccmemory.reflector.plist`,
  `StartCalendarInterval` 21:00 + `RunAtLoad`) runs `memory reflect --all --if-due`.
  `--if-due` checks `~/.claude/memory/<id>/.last-reflect` and runs only if >~20h
  stale → **idempotent**. macOS runs missed `StartCalendarInterval` jobs at wake; if
  powered off, `RunAtLoad` fires at next login and the due-guard decides. So a missed
  21:00 simply runs at next wake/login.
- **`consolidate-review` skill**: walk the proposals queue; approved → write via
  `save-learning` (writes files only); rejected → recorded so they aren't
  re-proposed. Snapshot afterward with `memory commit` if/when you want.
- **Extend** `save-learning` + `~/Desktop/project/CLAUDE.md`: document `#promote`,
  `superseded_by` (invalidate-don't-delete), `importance`, typed relations, and the
  worklog/`remember`/`memory-search` layers.

### Phase R — Rename `Obsidian Vault` → `Mate Vault` (after the system is stable)
- `git mv`/move `~/Documents/Obsidian Vault` → `~/Documents/Mate Vault`; re-add the
  vault in Obsidian under the new name.
- Update registry `kb`/`worklogs`, `~/Desktop/project/CLAUDE.md`, and the
  `save-learning` skill text (all mentions of the old path). Since hooks are now
  registry-driven, only the registry value changes for them.
- Verify SessionStart injection + search still resolve via the new path.

### P5 — Optional, evidence-driven (future)
- Roll typed relations + bi-temporal frontmatter across existing KB notes.
- `sqlite-vec` (local static embeddings, brute-force) + RRF **only** if paraphrase
  misses appear (past ~500–1k notes).
- Worklog retention/decay; and — explicitly deferred — **remote/multi-machine**:
  homeserver-run reflector + git remote (or Syncthing) to consolidate off-laptop.

## Files to create / modify

| Path | Action |
|---|---|
| `~/Documents/cc-memory/**` (repo: install.sh, src/lib, src/bin, src/hooks, src/skills, runners, docs) | create |
| `~/.claude/memory/registry.toml` | create (user state; seed `mate`; grows via `workspace add`) |
| `~/.claude/settings.json` | **modify** (register the 5 hooks → repo paths; keep buddy-reroll & plan-review) |
| `~/.claude/skills/*` (symlinks to repo skills, incl. **moved** `save-learning`) | create/repoint |
| `~/Library/LaunchAgents/dev.ccmemory.reflector.plist` | create (installed by install.sh) |
| `~/.local/bin/memory` (symlink) | create |
| `~/Documents/Obsidian Vault` → `~/Documents/Mate Vault` | **move** (Phase R) |
| `~/Desktop/project/CLAUDE.md` | **modify** (new layers + renamed path) |

## Verification

- **P0:** `./install.sh` is idempotent (run twice, no dupes in settings.json).
  `memory resolve ~/Desktop/project/website-ai-sdr` → `mate` + slug + paths;
  unmatched path → "no workspace". `memory workspace add demo --match ~/tmp/demo`
  → creates a git-initialized vault + `_Worklogs/` + index dir + registry block;
  overlapping `--match` or nested `--kb` → **rejected**; `workspace ls` lists all.
  `git -C "~/Documents/Obsidian Vault" status` → repo exists.
- **P1:** session in a worktree → `STATE.md` injected (or "no state yet"); `remember`
  → files at `<kb>/_Worklogs/<slug>/`; session end → auto line appended + one git
  commit; session under a *second* workspace path → only that workspace's KB index
  (**isolation**); diff `mate` SessionStart output vs pre-change → identical KB-index
  section (**no regression**).
- **P2:** edit/commit then finish → gate fires once, agent writes a change summary;
  no-op chat turn → no gate; respects `stop_hook_active` (≤8, no loop); `/compact`
  → summary in `<date>.md`.
- **P3:** `memory reindex` builds `index.db` for 81 notes <1s; `memory-search` on a
  known identifier → correct hits; prompt with that identifier → hits auto-injected;
  cross-workspace query returns nothing from the other (**isolation**).
- **P4:** seed a worklog with `#promote` lines → `memory reflect` emits sensible
  ADD/UPDATE/INVALIDATE proposals; set `.last-reflect` fresh then run
  `reflect --if-due` → **skips**; stale → runs (catch-up logic); `launchctl` shows
  the agent loaded; `consolidate-review` applies approved as real notes + commits;
  rejected not resurfaced.
- **Phase R:** after rename, a `mate` session resolves, injects, and searches via
  `~/Documents/Mate Vault`; git history preserved.
- **All hooks:** `echo '<bad json>' | <hook>` and missing-vault → exit 0, no output
  (**fail-open**).

## Out of scope / deferred
- Remote git, Syncthing, homeserver-run reflector, multi-machine sync (Phase 5 note).
- Vector embeddings / sqlite-vec / RRF (Phase 5, only if recall gaps).
- A standalone MCP server for search (start as a skill; promote later if needed).
- Disabling Claude Code's built-in auto-memory (`~/.claude/projects/.../memory/`) —
  it coexists; our worklog layer supersedes it for project work.
