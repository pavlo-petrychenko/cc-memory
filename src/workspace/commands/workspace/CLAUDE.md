# workspace command

The `memory workspace add|rm|ls` subcommands.

Owns `workspaceAdd` (validates against the existing registry, scaffolds the
vault — directories, `.gitignore`, home note, `git init` — registers it, then
builds its index once), `workspaceRm` (unregisters, optionally purging the
index file), and `workspaceLs` (lists registered workspaces with a live note
count, `"?"` when the index can't be read).

Output text lives beside the command in `workspace.formatter.ts`; the command
itself only decides which lines to print and in what order. Those strings are a
contract — the skills parse `workspace ls` and `workspace add` output.
