# modules/installation

Wires cc-memory into Claude Code (`settings.json` hooks, the `memory` shim,
skill symlinks, `installed.json`) and diagnoses that wiring with `memory doctor`.

`steps/` is one folder per installed artifact; `install.service.ts` orchestrates
them and `uninstall` reverses exactly what the manifest recorded; `doctor/`
gathers the health report. Commands: `install`, `uninstall`, `doctor`.
