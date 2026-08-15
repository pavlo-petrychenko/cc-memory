# commit

The `memory commit` subcommand: a manual, local-only, best-effort git snapshot
of each target workspace's kb repo (`git add -A` + `git commit`), never
pushed. A kb with no `.git` directory is skipped, not an error.

Runs sequentially across workspaces — two commits in the same kb repo at once
would race `git add`/`git commit`.
