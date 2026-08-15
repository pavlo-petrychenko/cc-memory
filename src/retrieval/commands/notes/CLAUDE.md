# notes (command)

The `memory notes` subcommand: resolves the target workspace, enumerates its
notes via `store/`'s `listNotes`, and prints them via `notes.formatter.ts`
(or raw JSON with `--json`).
