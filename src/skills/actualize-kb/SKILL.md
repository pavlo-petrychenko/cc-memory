---
name: actualize-kb
description: >-
  Reconcile the workspace knowledge base with what actually changed this session:
  AUDIT the related KB notes (in parallel via subagents) for staleness, gaps, and
  contradictions against the current code/decisions, then PROPOSE concrete
  ADD/UPDATE/INVALIDATE changes for approval. Use at the end of a substantial
  session ("actualize the KB", "update the docs for what we changed", "audit the
  KB"), optionally scoped to parts the user names. Unlike `save-learning` (capture
  one known fact) or `consolidate-review` (apply the reflector's worklog-derived
  proposals), this proactively sweeps EXISTING notes to find what the session made
  wrong or incomplete. Audits are read-only; KB writes ALWAYS need explicit approval.
---

# actualize-kb

Bring the current workspace's KB into line with reality after a session of work.
Two phases: **audit** (read-only, fan-out) then **actualize** (propose → approve →
write via `save-learning` conventions). Nothing is written to the KB without the
user's explicit per-item approval.

## 1. Resolve + scope

Run `memory resolve` for the workspace `id` + `kb`. If it prints "no workspace",
stop (offer `manage-workspace`).

Decide what to reconcile against ("the change-set") and what to audit:
- **Change-set (the new reality):** gather this session's concrete changes —
  `git -C <repo> diff` / `git log` since the session started, plus the
  decisions/learnings from the conversation. Write a short, concrete list: files,
  functions/flags, behaviors, decisions and their *why*.
- **Audit scope:** if the user named parts/features/folders, use those. Otherwise
  derive scope from the change-set (which features do the changes touch?).

## 2. Find the notes to audit (be exhaustive, not recall-limited)

For each in-scope feature folder, enumerate ALL its notes — don't rely on search
recall alone:
```
memory notes --folder <Feature> --json     # every indexed note under a folder
memory search "<topic terms>"               # plus search for cross-cutting hits
```
Union the results into the audit list. Include the feature's main index note.

## 3. Audit — fan out read-only subagents

Dispatch the audit in parallel (one subagent per note, or per folder for small
folders). Use the Agent tool (e.g. `Explore` or `general-purpose`), and pass each
subagent BOTH the note path and the change-set. Each subagent is **read-only** and
returns a structured verdict — it must NOT write anything:

> Read `<note path>`. Compare it against this change-set: `<change-set>`. Return a
> verdict for the note: CURRENT (accurate) / STALE (names what is now wrong) /
> INCOMPLETE (names what is missing) / CONTRADICTED (a fact now false → candidate
> for invalidate). Quote the offending lines. Do not edit anything.

Also ask (one subagent, or inline) the **gap question**: what durable, reusable
facts from the change-set have NO home note yet → candidate ADDs. Collect all
findings.

## 4. Synthesize proposals

Merge the verdicts into a concrete, de-duplicated change list. For each item:
- **action**: ADD / UPDATE / INVALIDATE (drop CURRENT notes and trivia).
- **target**: exact note path (existing for UPDATE/INVALIDATE; folder+title for ADD).
- **change**: precisely what to write/patch.
- **why** + **importance** (1–10). Apply the `save-learning` test: durable,
  feature-specific (never task-specific), non-obvious.

## 5. Propose — then write ONLY after approval

Present the list compactly to the user (action · target · one-line why). Ask which
to approve/edit/reject. **Write nothing yet.** Then apply approved items following
the **save-learning** skill exactly:
- ADD → atomic note (frontmatter, H1, full-path `[[wikilinks]]`, `## Related`),
  linked from the feature index note.
- UPDATE → patch the named note.
- INVALIDATE → set `superseded_by:` + `invalid_at:` on the old note (never delete),
  add the corrected note.
Then `memory reindex`. Do **not** `git commit` (versioning is manual via
`memory commit`).

## Boundaries
- KB writes ALWAYS require explicit per-item approval (hard rule).
- The audit phase is strictly read-only; subagents return findings, never edits.
- Feature/project-specific knowledge only — task logs belong in a worklog
  (`remember`), not the KB.
- Prefer UPDATE over near-duplicate ADD; if a fact has no clear home, ask.
