---
name: consolidate-review
description: >-
  Review the reflector's pending KB-promotion proposals and apply the approved
  ones to the knowledge base. Use when the user says "review proposals", "review
  consolidation", "process memory promotions", or after the nightly reflector has
  run. Walks the proposals queue, gets the user's approval per item, writes
  approved items via save-learning conventions, and records rejections so they
  aren't re-proposed. KB writes ALWAYS require explicit approval.
---

# consolidate-review

The reflector distils worklog `#promote`/Learned/Decided notes into a proposals
file; this skill turns approved proposals into durable KB notes. Nothing is in the
KB until you approve it here.

## Steps

### 1. Find the queue
Resolve the workspace and open the latest proposals file:
```
memory resolve            # -> workspace + worklogs path
```
Proposals live at `<worklogs>/_proposals/<date>.md`. Read the newest (and any
unprocessed older ones). Each item is a section headed `## [ ] ADD|UPDATE|INVALIDATE: …`
with a target path, rationale, source, and a proposed body.

### 2. Present for approval
Summarize the proposals compactly to the user (action, title, target, one-line
why). Ask which to approve, edit, or reject — do not write anything yet.

### 3. Apply approved items (via the save-learning conventions)
For each approved item, follow the **save-learning** skill:
- **ADD** → create the atomic note at the target path (frontmatter, H1, full-path
  wikilinks, `## Related`), and link it from the feature's index note.
- **UPDATE** → patch the named existing note.
- **INVALIDATE** → set `superseded_by: [[new note]]` + `invalid_at: <date>` on the
  old note (DO NOT delete it), then add the corrected note.
Then `memory reindex` so the new knowledge is searchable.

### 4. Mark the queue
In the proposals file, change applied items' `[ ]` → `[x]`; for rejected items,
change to `[~] rejected: <reason>` (so the reflector won't resurface them). Move
or mark fully-processed files as done.

### 5. Snapshot (optional, your call)
KB writes are NOT auto-committed. If you want a version snapshot now:
```
memory commit            # stages KB + worklogs, commits locally (no push)
```

## Boundaries
- Never write to the KB without explicit per-item approval.
- Proposals that are task-specific or trivial should be rejected, not weakened
  into vague notes — the KB stays high-signal.
