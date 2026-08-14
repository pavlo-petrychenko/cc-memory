# install

Wires cc-memory into Claude Code, and diagnoses that wiring afterward.

`install.service.ts` orchestrates the steps under `steps/` in order: resolve
the real `bun` binary, compute the `settings.json` hook surgery, write the
CLI shim, symlink skills, and seed a starter registry. `uninstall` reverses
exactly what the `manifest` step recorded — never a guess by substring
match, and never the user's registry or vault content.

`doctor/` gathers and renders `memory doctor`'s health report, independent
of the install/uninstall flow.

`utils/jsonFile/` is the shared atomic-JSON-file helper every step that
persists JSON (`settings`, `manifest`) is built on.
