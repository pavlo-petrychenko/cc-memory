# sessionStart

The `SessionStart` hook: runs a fast incremental reindex, then injects the
workspace's KB map and this worktree's working memory (`STATE.md`), joined
by a horizontal rule. Emits nothing when both parts are empty.

A reindex failure is swallowed — a stale index beats a broken `SessionStart`.
