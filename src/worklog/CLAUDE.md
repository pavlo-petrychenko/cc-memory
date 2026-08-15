# worklog

Short-term/episodic memory: `STATE.md` (living per-worktree state) and dated
journal entries under `<kb>/_Worklogs/<slug>/`, plus the manual `memory
commit` snapshot of a workspace's kb repo.

Owns the worklog file formats (`worklogFormat`), the filesystem I/O
(`worklogStore`), and the agent-visible renderers injected by session hooks
(`workingMemory`, `worklogFloor`). Does not own KB writes — those are
approval-gated and live in `knowledge/`.

`worklogFormat`'s two templates (`STATE.md` and one journal entry) are a
contract with every worklog already written into a vault — stay exact,
character for character, if you touch either. `worklogStore` only reads and
writes whatever text it's given; it does not own that text. `workingMemory`
and `worklogFloor` render agent-visible text injected at `SessionStart` and
`SessionEnd` respectively — keep both phrasings exact if you touch them.
`commit/`'s `memory commit` is a manual, local-only, best-effort git snapshot
of each target workspace's kb repo, never pushed; a kb with no `.git`
directory is skipped, not an error, and workspaces commit sequentially since
two commits in the same kb repo at once would race `git add`/`git commit`.
