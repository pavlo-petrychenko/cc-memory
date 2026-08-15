# resolver

Resolves a `cwd` to exactly one workspace, and a `cwd` within a workspace to a
worktree slug.

Owns: `resolveWorkspace` (longest-`match`-prefix win, `null` when nothing
matches — the isolation boundary between workspaces) and `worktreeSlug`
(prefers the git worktree root over a bare `cwd`, falling back when there is
no git repo or the toplevel lies outside the matched prefix).

Depends on `services/registry` for `expandWorkspace`; nothing here reads or
writes the registry file itself.
