---
name: remember
description: >-
  Write SHORT-TERM working memory (a worklog) for the current worktree: a summary
  of what changed this session, what was learned/decided, and open threads. Use at
  the end of a working session (the Stop-gate will also prompt for it), when the
  user says "save progress / note this / remember for next time", or before
  switching tasks. This is the episodic, per-worktree layer — NOT the durable KB
  (that's `save-learning`). Worklog writes need no approval; they are scratch that
  the nightly reflector later distils into the KB.
---

# remember

Capture the session into the worktree's worklog so the next session resumes with
context. Two files per worktree, under `<worklogs>/<slug>/`:
- `STATE.md` — the living state (current focus + open threads), overwritten.
- `<YYYY-MM-DD>.md` — append-only journal; one entry per wrap.

## Steps

### 1. Resolve the exact paths
Run `memory resolve` (it reads the cwd → workspace + worktree slug):
```
memory resolve
```
It prints `workspace`, `slug`, and `worklogs`. The files are:
`<worklogs>/<slug>/STATE.md` and `<worklogs>/<slug>/<today>.md`.
If it prints "no workspace", this directory isn't under a memory workspace — tell
the user and stop (offer `manage-workspace` to add one).

### 2. Append a journal entry to `<today>.md`
Create the file/dir if needed. Append (never overwrite) one entry:
```markdown
## HH:MM — <short topic>
**Changes:** <summary of ALL changes you made this session — files, modules, PRs, migrations, config>
**Learned:** #promote <non-obvious facts worth keeping; tag durable ones #promote>
**Decided:** <decisions + the why>
**Open:** <in-flight threads / next steps>
**Refs:** <branch · PR # · issue tracker · key files>
```
- Be concrete (name modules/tables/flags). `**Changes:**` must be a real summary
  of everything you did, not "did some work".
- Tag each genuinely durable, reusable fact with `#promote` so the reflector can
  find it. Task-specific noise does NOT get `#promote`.

### 3. Refresh `STATE.md`
Overwrite so it reflects reality now:
```markdown
---
type: worktree-state
workspace: <id>
worktree: <slug>
updated: <today>
---
# <slug> — working state

## Current focus
<1–3 lines: what this worktree is doing right now>

## Open threads
- [ ] <thread with enough context to resume cold>

## Working notes (ephemeral, not yet KB)
- <ephemeral facts, links, gotchas not yet durable>
```

## Boundaries
- Worklogs are short-term & task-specific — fine to be messy. Durable, reusable,
  feature-level knowledge belongs in the KB via **save-learning** (with approval).
- Do **not** `git commit`. Versioning is manual via `memory commit` when the user
  approves.
- Write the files directly (Write/Edit). No approval needed for worklogs.
