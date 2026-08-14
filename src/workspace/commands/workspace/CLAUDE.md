# workspace command

The `memory workspace add|rm|ls` subcommands.

Owns `workspaceAdd` (validates against the existing registry, scaffolds the
vault — directories, `.gitignore`, home note, `git init` — registers it, then
builds its index once), `workspaceRm` (unregisters, optionally purging the
index file), and `workspaceLs` (lists registered workspaces with a live note
count, `"?"` when the index can't be read).

CLI output text lives in `../../../cli/format.ts`; this file only decides
which lines to print and in what order.
