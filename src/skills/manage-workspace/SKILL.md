---
name: manage-workspace
description: >-
  Create, list, or remove cc-memory workspaces (the top-level memory scope: one
  workspace = one knowledge-base vault + isolated worklogs + index). Use when the
  user says "add a workspace", "set up memory for <dir>", "new KB for <project>",
  "list workspaces", or "remove workspace <id>". Thin wrapper over the `memory
  workspace …` CLI; it does the validation, vault scaffolding, registry edit, and
  initial index build.
---

# manage-workspace

cc-memory scopes all memory by **workspace**, resolved from the session's cwd via
`~/.claude/memory/registry.toml`. Each workspace has its own Obsidian-vault KB,
its own per-worktree worklogs, and its own search index — so a workspace-A session
never sees workspace-B's knowledge. This skill manages that registry.

## Commands (use the `memory` CLI)

- **Add:** `memory workspace add <id> --match <cwd-prefix>… [--kb <path>]`
  - `<id>`: short slug, e.g. `homeserver`, `acme`.
  - `--match`: one or more cwd prefixes that belong to this workspace (e.g.
    `~/homeserver`). Sessions whose cwd is under a prefix resolve here.
  - `--kb` (optional): KB vault path. Default `~/Documents/<Id> Vault/`.
  - It validates (unique id, non-overlapping match, non-nested kb), scaffolds the
    vault (`git init`, `.gitignore`, `.obsidian/`, a root index note) + `_Worklogs/`
    + the index dir, appends the registry block, and builds the initial index.
- **List:** `memory workspace ls` — all workspaces, their KB paths, note counts.
- **Remove:** `memory workspace rm <id> [--purge]` — unregisters; `--purge` also
  deletes the derived index (never the vault data).

## Workflow

1. Confirm the `id` and the `--match` cwd prefix(es) with the user (and `--kb` if
   they want a non-default location).
2. Run `memory workspace add …`. If it errors on overlap/nesting, report which
   existing workspace conflicts and ask how to resolve.
3. Show `memory workspace ls` so the user sees the result.

## Notes

- Adding a workspace does **not** commit anything. Versioning commits are manual
  via `memory commit` when the user approves.
- The KB starts nearly empty; durable knowledge arrives via the `save-learning`
  skill and the nightly reflector. Short-term notes arrive via `remember`.
