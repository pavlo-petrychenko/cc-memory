# Persistent Memory for Claude Code — System Design

Status: proposal (2026-06-27). Builds on an existing Obsidian vault +
`save-learning` skill + `obsidian-kb-index.py` SessionStart hook. Nothing here
replaces those; it extends them.

## 0. Verdict (the load-bearing decisions)

1. **Don't build Chroma / a vector DB.** At your scale (81 notes → low thousands)
   and content type (single-author, code-heavy, exact identifiers), **SQLite
   FTS5 (BM25) + ripgrep + the wikilink graph clears >90% of retrievals.** BM25
   *beats* embeddings on code because queries hinge on exact tokens (function
   names, flags, error strings) that embeddings blur. Add `sqlite-vec` (local
   static embeddings, brute-force, no ANN) *only* if/when you observe paraphrase
   misses — likely past ~500–1k notes. (Evidence: "I replaced my agent's vector
   DB with grep", 8mo in prod; documented scale thresholds.)
2. **Files stay the source of truth; the index is derived & disposable.** This is
   the `basic-memory` model and it's correct. Your vault is already this.
3. **The agent that did the work is the best reflector** — its context already
   holds the transcript, so self-authored memory costs only output tokens, no
   re-read. Enforce it with the `Stop` hook gate.
4. **Enforcement = a separate automated pass, not agent discipline.** Hooks
   capture; the agent self-authors at wrap; a nightly reflector promotes to KB.

## 1. Vocabulary (replacing "project")

| Term | Was | Meaning |
|---|---|---|
| **Workspace** | "project" | Top-level domain with ONE shared KB. e.g. `acme`, `homeserver`. Maps to a set of directories. |
| **Knowledge Base (KB)** | the vault | Long-term **semantic** memory for a workspace. Durable facts/docs. Shared across all worktrees. |
| **Worklog / Working Memory** | (missing) | Short-term **episodic** memory, **one per worktree**, dated. Scratch, decisions-in-flight, "what happened today". |
| **Reflector** | (missing) | Nightly consolidation agent: worklog → proposed KB promotions. |

Memory metaphor: KB = semantic/long-term; Worklog = episodic/short-term;
Reflector = consolidation/"sleep".

## 2. Architecture

```
WORKSPACE  "acme"   (resolved from cwd under ~/code/acme)
│
├── KNOWLEDGE BASE — long-term, shared           ~/Documents/Acme Vault
│     · atomic notes · typed [[wikilinks]] · per-feature index notes
│     · READ: index always-on (SessionStart, already built) · notes on demand
│     · WRITE: save-learning skill (your approval)  +  nightly Reflector
│
└── WORKING MEMORY — short-term, per worktree
      ├─ worktree service-api   → worklogs/acme/service-api/2026-06-27.md
      ├─ worktree web           → worklogs/acme/web/2026-06-27.md
      └─ worktree infra         → worklogs/acme/infra/2026-06-27.md
        · READ: recent entries + open threads injected on SessionStart
                (scoped to THIS worktree only — Agent A ≠ Agent B)
        · WRITE: agent self-authors at wrap (Stop-gate)
                 + PostCompact summary (free) + SessionEnd git skeleton (0 tok)
                          │
                          └─ nightly REFLECTOR ─proposes→ KB promotions (approval)
```

Workspace resolution: a small registry maps a cwd prefix → workspace →
(KB path, worklog root). Hooks already receive `cwd` on stdin.

```
~/code/acme/*        → workspace "acme"      KB: ~/Documents/Acme Vault
~/homeserver/* (etc) → workspace "homeserver" KB: <its vault>
```

Worktree key = slug derived from cwd (e.g. `~/code/acme/service-api` →
`service-api`). Git worktrees live at different paths → naturally separate
worklogs → satisfies "Agent A isolated from Agent B, shared KB".

## 3. The hooks (verified mechanics, 2026 docs)

| Hook | Role | Token cost | Mechanism (verified) |
|---|---|---|---|
| **SessionStart** | Inject KB index (✅ built) + this worktree's recent worklog + open threads | ~0 | `hookSpecificOutput.additionalContext`, self-scoped by `cwd`; `source` ∈ startup/resume/clear/compact |
| **UserPromptSubmit** | Auto-retrieve: FTS5/ripgrep keyed to prompt text → inject top KB/worklog hits | tiny | `additionalContext`; 30s timeout; can also block |
| **Stop** | Wrap-gate: if work happened & worklog stale, block once → agent self-authors worklog | output only | `{"decision":"block","reason":"…"}`; guard with `stop_hook_active` + per-session marker (8-block hard cap) |
| **PostCompact** | Persist `compact_summary` to worklog so context survives compaction | free | payload carries `compact_summary` (PreCompact does NOT — runs before summary exists) |
| **SessionEnd** | Deterministic floor: git diff --stat + branch + commands → worklog | 0 | shell only; cannot reprompt the model (too late); 1.5s default timeout |
| **cron Reflector** | worklog → KB promotion proposals | bounded (~2–4k, reads worklogs NOT transcript) | `claude -p` works inside cron/hook |

Key nuance on the Stop-gate: it fires at the end of *every* turn, so we guard it
to fire **at most once per batch of unsaved work** (marker file reset when new
git activity accumulates). It's a one-time "write your worklog before you go",
not a per-turn nag. The write target is short-term scratch → **no approval
friction** (unlike KB writes).

This uses all three enforcement surfaces you asked for: **hooks** (above),
**skills** (`save-learning` for KB, a new `remember`/worklog skill + `consolidate`
for manual reflection), **CLAUDE.md** (always-on directives + the rules).

## 4. Retrieval

- **Now (81 notes):** ripgrep over markdown + the existing `obsidian` MCP +
  wikilink traversal. Already enough; the gap is *automatic* injection, solved by
  the UserPromptSubmit hook.
- **Soon (index):** a derived `memory.db` beside the vault — **FTS5** over note
  bodies + observations, plus a **link/edge table** parsed from wikilinks (for
  graph traversal + node-distance reranking). Rebuildable from files anytime.
  Indexer runs on a hook or a watch.
- **Combine** with RRF (`Σ 1/(k+rank)`, k=60) once both FTS and vectors exist.
- **Later (only if recall gaps):** `sqlite-vec` table, local static embeddings
  (potion-base / MiniLM), **brute-force exact** search (<10k vectors = single-digit
  ms, no ANN to maintain). All in the one `.db`.
- **Deliberately NOT:** dedicated vector DB, ANN index, graph DB, Postgres, cloud.

## 5. What to steal (mapped onto your system)

- **basic-memory** → files-as-truth + SQLite-as-index; upgrade note bodies with
  typed observations `- [decision] … #tag` and **typed** relations
  (`- depends_on [[…]]`, `- supersedes [[…]]`) so the graph is machine-traversable,
  not just `## Related`.
- **Zep/Graphiti** → **bi-temporal**: when a fact changes, **invalidate, don't
  delete** (add `valid_at` / `invalid_at` or `superseded_by` frontmatter). Keeps
  an auditable history of how your knowledge evolved.
- **Generative Agents (Park)** → `importance` (1–10) on notes; the Reflector
  fires synthesis when summed importance of recent worklog entries crosses a
  threshold; retention = importance + recency-decay + access-frequency.
- **mem0 classic (pre-2026)** → the Reflector's per-candidate decision:
  **ADD / UPDATE / INVALIDATE / NOOP** (dedup + contradiction). (Skip mem0's 2026
  ADD-only regression.)
- **A-MEM** → when adding a KB note, update neighbors' links (memory evolution);
  LLM-generated keywords/tags/context per note.
- **Letta sleep-time** → Reflector is off the hot path, can use a stronger model,
  can use git worktrees if it writes concurrently.
- **Anthropic memory tool** → "assume interruption, checkpoint before clear" =
  exactly the PostCompact hook.

## 6. Build plan (each phase independently useful)

- **Phase 0 — Foundations.** Workspace registry (cwd → workspace → KB + worklog
  root). Decide where worklogs live. Worktree-slug helper.
- **Phase 1 — Working memory exists.** Worklog format + a `remember` skill (agent
  appends episodic notes) + extend SessionStart hook to inject this worktree's
  recent worklog & open threads + SessionEnd deterministic floor.
  → *Closes gaps 3 (no short-term) and 5 (worktree-scoped start context).*
- **Phase 2 — Enforcement.** Stop-gate hook (self-authored worklog at wrap) +
  PostCompact checkpoint.
  → *Closes gap 1 (agent forgets to capture).*
- **Phase 3 — Retrieval.** SQLite FTS5 indexer + UserPromptSubmit auto-injection
  + a `memory-search` skill/MCP tool.
  → *Closes gap 2 (weak search).*
- **Phase 4 — Consolidation loop.** Nightly cron Reflector: read worklogs →
  ADD/UPDATE/INVALIDATE/NOOP proposals → queue for morning approval → write via
  save-learning.
  → *Closes gap 7 (no promotion).*
- **Phase 5 — Optional upgrades.** Typed relations + bi-temporal frontmatter;
  `sqlite-vec` if recall gaps; importance/decay-based retention.

## 7. Open decisions

1. **Where do worklogs live?** (a) inside the vault under `_Worklogs/` (Obsidian-
   browsable, one place) — but must stay clearly separated from durable KB notes;
   (b) a separate dir e.g. `~/.claude/memory/<workspace>/worklogs/` (keeps KB
   pristine, still git-versioned); (c) a second Obsidian vault.
2. **Workspaces to support now:** just `acme` first, or build the registry for
   `acme` + `homeserver` up front?
3. **Start building Phase 1 now**, or refine the design more first?

---

# Part II — Detailed design

Decisions locked: keep the vault + DIY retrieval (borrow basic-memory's
FTS5+sqlite-vec+RRF *pattern*, not the framework). **Per-workspace KBs with soft
isolation** — a workspace-A session must never load workspace-B's KB into context
(not FS-enforced; just structurally never read).

## 8. Multi-workspace isolation (the hard boundary)

Workspace is the boundary for **every** memory operation. Isolation is achieved
by making cross-workspace data *structurally unreachable* in a session, not by
filtering:

- **One registry, longest-prefix resolution.** A session's `cwd` resolves to
  exactly one workspace (the longest matching prefix). No match → no memory at
  all (clean, like today's scope guard).
- **Per-workspace index DB.** Search can't cross workspaces because each
  workspace has its own `index.db`; the hook only opens the resolved one.
- **Per-workspace injection.** SessionStart injects only the resolved workspace's
  KB index + the current worktree's state. B's index never enters A's context.
- **Per-workspace reflector run.** Consolidation reads/writes within one
  workspace only.

A workspace's KB may be a **whole vault** OR a **subfolder of a shared vault** —
the registry's `kb` path handles both; everything keys off that root.

## 9. Workspace registry

`~/.claude/memory/registry.toml` (read by every hook; ~no cost):

```toml
[[workspace]]
id       = "acme"
match    = ["~/code/acme"]                    # cwd prefixes (longest wins)
kb       = "~/Documents/Acme Vault"           # vault OR subfolder
worklogs = "~/Documents/Acme Vault/_Worklogs"      # markdown, lives in vault
exclude  = ["_Worklogs", "Archive", ".obsidian"]   # never indexed/injected
index_db = "~/.claude/memory/acme/index.db"   # derived, OUTSIDE the vault

[[workspace]]
id       = "homeserver"
match    = ["~/homeserver", "~/Desktop/homeserver"]
kb       = "~/Documents/Homeserver Vault"     # different vault → isolated
worklogs = "~/Documents/Homeserver Vault/_Worklogs"
exclude  = ["_Worklogs", ".obsidian"]
index_db = "~/.claude/memory/homeserver/index.db"
```

**Where things live (the truth/derived split):**
- Markdown (source of truth) → in the vault, git-versioned, Obsidian-editable.
  Worklogs are markdown → `_Worklogs/` inside the vault (excluded from the KB
  index so they never pollute durable knowledge).
- SQLite `index.db` (derived, disposable, rebuildable) → **outside** the vault in
  `~/.claude/memory/<workspace>/` so a binary never syncs into Obsidian/git.

**Worktree slug** = `cwd` relative to the matched prefix, slashes→dashes
(`~/code/acme/service-api` → `service-api`). Git worktrees sit at
distinct paths → distinct slugs → isolated worklogs automatically.

## 10. Worklog schema (two-file model per worktree)

Mirrors human memory: a small **living state** you reload each session, plus an
append-only **episodic journal** the reflector consolidates.

```
<kb>/_Worklogs/<worktree-slug>/
    STATE.md            # living: current focus + open threads (injected on start)
    2026-06-27.md       # episodic: one appended entry per session wrap
    2026-06-26.md
```

**STATE.md** — small, current, overwritten in place. This is what SessionStart
injects (resume context):

```markdown
---
type: worktree-state
workspace: acme
worktree: service-api
updated: 2026-06-27
---
# service-api — working state

## Current focus
Migrating the service off serverless onto the shared API; moving prompts into a
versioned store.

## Open threads
- [ ] Confirm why the legacy datastore was chosen before cutover
- [ ] Add webhooks to run the test suite on every prompt change

## Working notes (ephemeral, not yet KB)
- The old playground is being dropped; the versioned store replaces it (for now)

## Recent entries → 2026-06-27.md, 2026-06-26.md
```

**`<date>.md`** — append-only; one entry per session wrap (Stop-gate writes this):

```markdown
## 16:40 — migration planning
**Did:** Scoped the serverless→API move; drafted the migration doc outline.
**Learned:** #promote The eval tool scores per-prompt, not per-feature — fine here, we want isolated prompt testing.
**Decided:** Cutover happens on the upstream side, not ours — why: they own the switch.
**Open:** Legacy datastore motivation unknown; webhooks for prompt-change test runs.
**Refs:** branch feat/api-migration · tracker TICKET-123 · files: (none yet)
<!-- auto (SessionEnd): commits=0, files touched: docs/migration.md (+120) -->
```

- `#promote`-tagged lines (and `**Learned:**`/`**Decided:**`) are the explicit
  **candidate signal** the reflector scans for. Everything else is just history.
- The Stop-gate's injected `reason` tells the agent: append today's entry +
  refresh STATE.md (Current focus, Open threads), tag durable findings `#promote`.
- The SessionEnd floor appends the deterministic `<!-- auto … -->` line with zero
  tokens if the agent never wrapped (killed session).

## 11. Retrieval / index design

**`index.db` (one per workspace, outside the vault):**

```sql
notes(id, path, title, type, importance, valid_at, invalid_at,
      superseded_by, updated, mtime)
notes_fts USING fts5(title, body, observations, tags, content='notes')   -- BM25
links(src_id, dst_id, rel_type)        -- parsed from typed [[wikilinks]]
worklog_fts USING fts5(worktree, date, body)   -- recent episodic, searchable
-- later, only if recall gaps:
-- vec(id, embedding)  USING sqlite-vec   -- local static embeds, brute-force
```

**Indexer** (Python, incremental by mtime — instant at 81 files): walks `kb`
(minus `exclude`), parses frontmatter + body + `[[wikilinks]]`, upserts. Runs on:
SessionStart (fast incremental), after save-learning writes, before a reflector
run, and on a manual `memory reindex`.

**Two retrieval surfaces:**
1. **UserPromptSubmit auto-injection** — extract salient tokens from your prompt
   (identifiers, quoted strings, CamelCase, `--flags`), FTS5 MATCH (BM25), inject
   top 3–5 as `title · one-line · path` (capped ~30 lines). Only fires when a
   technical token is present + score over threshold → no noise on chit-chat.
   *This is what makes search automatic instead of "agent remembers to search".*
2. **`memory-search` skill/MCP tool** — agent-callable for deeper/iterative
   search: FTS5 + 1-hop link expansion + optional LLM rerank on top ~20. Returns
   ranked paths + snippets; agent reads full notes on demand. Replaces the weak
   `obsidian` `search_notes`.

**RRF (k=60)** only enters once vectors exist; until then, pure BM25 ranking.
Scale guidance: 50–500 notes = BM25-only is enough; add `sqlite-vec` brute-force
+ RRF only past ~500–1k when paraphrase misses appear.

## 12. Reflector decision procedure (nightly cron, per workspace)

Off the hot path; may use a stronger model (Letta sleep-time idea). Reads
**worklogs, never transcripts** → bounded (~2–4k tokens).

1. **Gather candidates** — across all worktrees in the workspace, collect
   `#promote` / `**Learned:**` / `**Decided:**` lines from entries since last run.
2. **Per candidate, retrieve** top-k similar existing KB notes via `index.db`.
3. **Decide (LLM, per candidate)** — borrow mem0-classic:
   - **NOOP** — task-specific, already covered, or not durable → leave in worklog.
   - **ADD** — new durable fact → propose new atomic note (home folder, title,
     typed links, `importance` 1–10).
   - **UPDATE** — extends an existing note → propose a patch/diff.
   - **INVALIDATE** — contradicts a note → propose marking old note
     `superseded_by:` + add new note. **Never hard-delete** (Zep bi-temporal).
4. **Filter** proposals below an importance threshold (e.g. <4) → no KB bloat.
5. **Dedup** proposals against each other.
6. **Queue, don't write** — emit `<kb>/_Worklogs/_proposals/<date>.md`: a
   checklist of ADD/UPDATE/INVALIDATE with target paths, diffs, rationale.
7. **Morning approval** — a `/consolidate-review` skill walks the queue; approved
   items are written via `save-learning` (KB writes stay approval-gated — your
   hard rule). Rejected items are noted so they aren't re-proposed.
8. **Hygiene (optional)** — flag stale open threads in STATE.md; archive/decay
   worklogs older than N days (importance + recency + access-frequency).

## 13. Open sub-decisions (within the refined design)

- Two-file worklog model (STATE.md + dated journal) — good, or single file?
- Promote signal: `#promote` tag vs an Obsidian `> [!promote]` callout vs just
  relying on the `**Learned:**`/`**Decided:**` headings?
- Reflector cron time (e.g., 21:00 local) + does it run per-workspace or all.
- Importance threshold for promotion (start at 4/10?).
```
