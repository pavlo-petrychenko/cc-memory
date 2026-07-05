# Persistent Memory — Build Plan (no code yet)

Companion to `memory-system-design.md`. Ordered by dependency; every phase ships
something useful on its own. Decisions locked: keep vault + DIY retrieval;
per-workspace soft isolation; two-file worklog (STATE.md + dated journal);
`#promote` signal; daily reflector with your approval on KB writes.

## Component → enforcement-surface map

| Component | Surface | New/Extend |
|---|---|---|
| Workspace registry + resolution lib | (shared) | new |
| KB index + worktree-state injection | hook: SessionStart | **extend** `obsidian-kb-index.py` |
| Auto-retrieval injection | hook: UserPromptSubmit | new |
| Wrap-gate (force worklog write) | hook: Stop | new |
| Compaction checkpoint | hook: PostCompact | new |
| Deterministic floor | hook: SessionEnd | new |
| `remember` (write worklog) | skill | new |
| `memory-search` | skill | new |
| `consolidate-review` (apply proposals) | skill | new |
| save-learning (promote/bitemporal aware) | skill | **extend** existing |
| Reflector | cron (`claude -p`) | new |
| Rules for the above | CLAUDE.md | **extend** `~/code/acme/CLAUDE.md` |

## Cross-cutting rules (apply to every phase)

- **One shared resolution library** (`~/.claude/memory/lib/`) parses the registry,
  resolves cwd→workspace (longest prefix), derives worktree slug. Every hook
  imports it — no copy-paste drift.
- **Fail open, always.** Every hook: any error → exit 0, no output. Never break a
  session (matches the current hook's discipline).
- **Speed budgets.** SessionStart + UserPromptSubmit must stay fast (sub-few-
  hundred-ms); indexing is incremental by mtime.
- **Registry format:** JSON (zero-dependency for the Python hooks) unless we
  confirm Python ≥3.11 everywhere (then tomllib/TOML is fine).
- **Test without live sessions:** a `memory doctor` CLI that feeds synthetic hook
  JSON on stdin to each hook and prints what it would inject/do.

---

## Phase 0 — Foundation: registry + resolution

- **Goal:** deterministic cwd→workspace→{kb, worklogs, exclude, index_db} +
  worktree slug. Nothing changes in sessions yet.
- **Deliverables:** `~/.claude/memory/registry.json`; `~/.claude/memory/lib/`
  (resolve + slug + path helpers); `memory resolve <cwd>` CLI for inspection.
- **Depends on:** nothing.
- **Acceptance:** `memory resolve ~/code/acme/service-api` →
  workspace `acme`, slug `service-api`, correct paths; a path under no match →
  "no workspace".

## Phase 1 — Working memory exists & loads on start  → closes gaps 3, 5

- **Goal:** short-term memory is real, worktree-scoped, and auto-loaded; KB
  injection becomes workspace-scoped (delivers KB isolation for injection).
- **Deliverables:**
  - Worklog conventions: `STATE.md` + `<date>.md` templates under
    `<kb>/_Worklogs/<slug>/`.
  - `remember` **skill**: agent appends a dated entry + refreshes STATE.md
    (Current focus / Open threads), tagging durable lines `#promote`.
  - **Extend SessionStart hook**: registry-driven; inject (a) the resolved
    workspace's KB top-level index (replacing the hardcoded vault), excluding
    `_Worklogs/` etc., + (b) this worktree's `STATE.md` + open threads.
  - **SessionEnd hook**: deterministic floor — git diffstat/branch/commands →
    `<!-- auto … -->` line in today's `<date>.md` (0 tokens).
- **Depends on:** Phase 0.
- **Acceptance:** start a session in a worktree → STATE injected (or "no state
  yet"); run `remember` → files created in the right scoped path; end session →
  auto line appended; start a session under the homeserver path → only homeserver
  KB index appears (isolation check).
- **Risk:** generalizing the existing hook without regressing today's behavior —
  keep the existing workspace producing an identical index to today's output.

## Phase 2 — Enforcement: capture is guaranteed  → closes gap 1

- **Goal:** the agent reliably writes worklog at wrap; context survives compaction.
- **Deliverables:**
  - **Stop hook (wrap-gate):** if meaningful work happened (git drift since last
    worklog update) AND worklog not yet refreshed this session → return
    `{"decision":"block","reason": "<write your worklog: append today's entry +
    refresh STATE; tag durable findings #promote>"}`. Guard with
    `stop_hook_active` + a per-session marker (keyed by `session_id`) that resets
    when new git activity appears, so it fires at most once per batch — not a
    per-turn nag.
  - **PostCompact hook:** append `compact_summary` to today's `<date>.md`.
- **Depends on:** Phase 1 (needs worklog + `remember`).
- **Acceptance:** make an edit/commit, try to finish → gate fires once and the
  agent writes the worklog; a no-op chat turn → no gate; force compaction →
  summary lands in the journal; confirm no infinite loop (respects
  `stop_hook_active`).
- **Risk (the big UX one):** blocking mid-flow is annoying. **Mitigation/tuning:**
  start as a **non-blocking nudge** (inject `additionalContext` "you have unsaved
  work") and only escalate to a hard block after N unsaved turns or large drift.
  Tune thresholds after living with it a few days.

## Phase 3 — Retrieval: fast, automatic, isolated  → closes gap 2

- **Goal:** BM25 search per workspace; relevant hits injected automatically.
- **Deliverables:**
  - `index.db` schema (notes, notes_fts, links, worklog_fts) per workspace,
    outside the vault.
  - `memory-index` **indexer**: incremental walk of `kb` (minus excludes), parse
    frontmatter + body + `[[wikilinks]]`; run on SessionStart (incremental),
    after save-learning, before reflector, and manually.
  - **UserPromptSubmit hook:** salient-token extraction → FTS5 MATCH → inject top
    3–5 (capped, threshold-gated so chit-chat injects nothing).
  - `memory-search` **skill:** FTS5 + 1-hop link expansion (+ optional rerank);
    returns ranked paths + snippets; replaces weak `obsidian search_notes`.
- **Depends on:** Phase 0 (paths). Independent of 1–2, but best after 1.
- **Acceptance:** index 81 notes in <1s; query a known identifier → correct top
  hits; prompt containing that identifier → hits auto-injected; a query in
  workspace A returns nothing from workspace B (isolation).
- **Note:** pure BM25 now; `sqlite-vec` + RRF deferred to Phase 5.

## Phase 4 — Consolidation loop  → closes gap 7

- **Goal:** worklog → KB promotion, decided automatically, applied on your OK.
- **Deliverables:**
  - **Reflector** (cron via `claude -p`, per workspace): gather
    `#promote`/Learned/Decided since last run → retrieve similar KB notes →
    decide **ADD/UPDATE/INVALIDATE/NOOP** → importance-filter + dedup → write
    `<kb>/_Worklogs/_proposals/<date>.md` (checklist + diffs + rationale). Reads
    worklogs only, never transcripts.
  - **Schedule** it (your `schedule`/CronCreate) — default 21:00 local.
  - `consolidate-review` **skill:** walk the proposals queue; approved → write via
    **save-learning**; rejected → recorded so they aren't re-proposed.
  - **Extend save-learning + CLAUDE.md:** `#promote` convention, `superseded_by`
    (invalidate-don't-delete), `importance` frontmatter, typed relations.
- **Depends on:** Phases 1 (worklogs) + 3 (index for similarity).
- **Acceptance:** seed a worklog with `#promote` lines → reflector emits sensible
  ADD/UPDATE/INVALIDATE proposals; review applies them as real notes; a rejected
  proposal isn't resurfaced next run.

## Phase 5 — Optional, evidence-driven upgrades

- Roll typed relations + bi-temporal frontmatter across existing KB notes.
- Add `sqlite-vec` (local static embeddings, brute-force) + RRF **only** when
  paraphrase misses appear (past ~500–1k notes).
- Worklog retention/decay (importance + recency + access-frequency); archive old
  dated files.

---

## Suggested sequencing

P0 → **P1** (biggest single value: short-term memory + isolation) → **P3**
(search; independent, can parallel P2) → **P2** (enforcement; tune live) → **P4**
(close the loop) → P5 (as needed). P1 alone already gives you scoped, persistent,
auto-loaded working memory — the thing most missing today.
