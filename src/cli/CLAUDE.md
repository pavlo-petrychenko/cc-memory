# cli

The composition shell — turns argv into one `CliOutcome`, which `main.ts`
alone maps to a process exit. Not a module; owns no persisted state.

Holds `main.ts` (the composition root), `args/`, `help/`, and the cross-module
commands `search` and `reindex`. Imports every module; no module imports `cli`.
