# worklog

Short-term/episodic memory: `STATE.md` (living per-worktree state) and dated
journal entries under `<kb>/_Worklogs/<slug>/`, plus the manual `memory
commit` snapshot of a workspace's kb repo.

Owns the worklog file formats (`worklogFormat`), the filesystem I/O
(`worklogStore`), and the agent-visible renderers injected by session hooks
(`workingMemory`, `worklogFloor`). Does not own KB writes — those are
approval-gated and live in `knowledge/`.
