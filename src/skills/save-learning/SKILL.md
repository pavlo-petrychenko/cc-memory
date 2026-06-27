---
name: save-learning
description: >-
  Capture durable, reusable engineering knowledge into the current workspace's
  knowledge-base vault. Use whenever the user says "save this", "remember this",
  "add to the KB / vault / Obsidian", "document this", "update the knowledge base",
  OR proactively at the end of a substantive task (research, debugging, a shipped
  feature) that produced reusable, feature-level knowledge. It defines WHERE
  knowledge goes (the resolved workspace KB, one folder per feature, atomic notes),
  the note FORMAT (frontmatter, H1, full-path wikilinks, importance, bi-temporal
  supersede), and the propose-then-write workflow. Writing to the KB ALWAYS
  requires the user's explicit approval first. This is the durable/long-term write
  path; short-term notes use `remember`, and discovery uses `memory-search`.
---

# save-learning

Turn what was just learned into durable knowledge in the **current workspace's**
KB vault. Knowledge is **feature/project-specific, never task-specific** — capture
the reusable fact about the feature, not "what I did in PF-12345".

## Locate the KB (workspace-aware)

Run `memory resolve` to get the workspace `id` and its `kb` path. All notes go
under that `kb`. (For the `mate` workspace the vault is also wired to the
`obsidian` MCP, which you may use for reads/writes; for any other workspace, use
plain Read/Write/Edit on files under `kb`.) After writing, run `memory reindex` so
the note is immediately searchable.

## Workflow (in order)

### 1. Decide if it's worth saving
Save only if ALL hold (else don't propose a write):
- **Durable & reusable** — true beyond this task; you'd want it next month.
- **Feature/project-specific** — belongs to a feature, not a ticket.
- **Non-obvious** — not derivable from the code, git history, or a repo's CLAUDE.md.
  Capture the gotcha, the "why", the cross-system glue.

(Proposals from the reflector — derived from `#promote` worklog lines — have
already been pre-filtered; still apply this test.)

### 2. Find the right home (search before creating)
Use `memory search "<terms>"` (and `list_directory`/`read_note` for `mate`) to find
the feature folder and any note that already covers this. **Update an existing
note** rather than create a near-duplicate. If no feature folder fits, or it's
cross-cutting with no clear home, **ask the user where it should go**.

### 3. Draft the note in vault style
- **Filename = the note's title** (Title Case), placed in its feature sub-folder
  (e.g. `Architecture/`, `Data/`, `Services/`, `AI/`, `Operations/`).
- **Frontmatter:** atomic notes use `type: note`; add `importance: <1-10>`. A
  feature's *main* index note uses `type: index` with `feature`/`epic`/`captured`.
- **Body:** start with an `# H1` matching the title, a one-line "what this is",
  then `##` sections. Be concrete: name the table/module/flag/file, the "why",
  and where it bites.
- **Link liberally with FULL-PATH wikilinks** — `[[folder/sub/Note|Display]]` —
  and prefer **typed relations** where meaningful (`- depends_on [[…]]`,
  `- supersedes [[…]]`). End with a `## Related` line.
- **Absolute dates only** (`2026-06-27`).

### 4. Bi-temporal updates (invalidate, don't delete)
If a new fact **contradicts** an existing note: do NOT delete the old one. Set on
the old note frontmatter `superseded_by: "[[path/New Note]]"` and `invalid_at:
<date>`, leave its body, and create the corrected note. This keeps an auditable
history of how the knowledge changed.

### 5. Make it discoverable
A new note must be reachable from its feature's main index note
(`<Feature>/<Feature>.md`) — add a wikilink under the right section or `## Related`.
Don't leave notes orphaned.

### 6. Propose, then write ONLY after approval
**Before saving anything, ask permission:** list every doc you'll create or update
and exactly what changes — hide nothing. Write only after explicit approval. Then
`memory reindex`. Do **not** `git commit` — versioning is manual via `memory commit`.

## Note template (atomic note)
```markdown
---
type: note
importance: 6
---
# <Title matching the filename>

<One line: what this is and why it matters.>

## <Section>
<Concrete fact. Name the module/table/flag. Explain the "why" and where it bites.>
See [[Feature/Sub/Other Note|Other Note]].

## Related
- depends_on [[Feature/Sub/Note A|Note A]] · [[Feature/Sub/Note B|Note B]]
```

## Good vs. bad
- ✅ "`overall_score` is an LLM holistic number, not bounded 0–100; its ceiling
  drifts by prompt_version — don't average raw scores across versions." → reusable
  gotcha about a real field.
- ❌ "Fixed the scoring bug in PR #1234 today." → task log; belongs in a worklog
  (`remember`), never the KB.
