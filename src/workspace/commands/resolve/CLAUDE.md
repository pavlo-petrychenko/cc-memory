# resolve command

The `memory resolve` subcommand: reports which workspace (if any) a `cwd`
belongs to, its worktree slug, and its vault/worklog/index paths.

A cwd outside every workspace is not a failure — it prints a plain message and
still exits 0, unlike `search`/`notes`'s `--workspace`-less miss.
