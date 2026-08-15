# install

Wires cc-memory into Claude Code, and diagnoses that wiring afterward.

`install.service.ts` orchestrates the steps under `steps/` in order: resolve
the real `bun` binary, compute the `settings.json` hook surgery, write the
CLI shim, symlink skills, and seed a starter registry. `uninstall` reverses
exactly what the `manifest` step recorded — never a guess by substring
match, and never the user's registry or vault content.

`doctor/` gathers and renders `memory doctor`'s health report, independent
of the install/uninstall flow; `commands/doctor/` is its CLI surface and
prints two lines itself before calling in — registry status and
cwd-to-workspace resolution — that must stay byte-identical across changes;
`DoctorService`/`DoctorFormatter` are required constructor parameters, wired
by `cli/main.ts`, never constructed inside `execute`. `commands/install/`'s
`InstallCommand`/`UninstallCommand` take `container` as a required
constructor parameter — `cli/main.ts` builds it from the real `process.env`
at dispatch, the same way it does for `Hook`, since both exist to modify this
user's real Claude Code setup — a test always supplies an explicit fake
instead.

`utils/jsonFile/` is the shared atomic-JSON-file helper every step that
persists JSON (`settings`, `manifest`) is built on: a missing file reads as
`{}`; a present file that fails to parse, or isn't an object, is a typed
`JsonFileError`, never a thrown exception; writes are atomic (`<path>.tmp`
then rename), two-space-indented JSON plus a trailing newline.

Per-step notes: `bunPath` resolves the REAL `bun` binary via `readlink -f
$(which bun)`, verified to still exist on disk — never an ephemeral
version-manager shim — and refuses rather than guessing on any failure.
`manifest` (`~/.claude/memory/installed.json`) records exactly what the last
install wrote, so `settings` can purge hook groups by their EXACT former
command string instead of guessing from a substring, and `uninstall` can
reverse exactly what was installed; a missing, corrupt, or pre-manifest-era
file all parse to `null`, never a thrown error. `settings` preserves every
foreign top-level key and hook group byte-for-byte, including its position in
the file. `seed` never overwrites a registry that already exists — a real
registry is the user's data, not an installed artifact. `shim`
(`~/.local/bin/memory`) always removes any pre-existing path first, since
`writeFile` follows a symlink and would otherwise silently overwrite whatever
it pointed at. `skills` gets its idempotency from the manifest, not the
filesystem — a skill recorded in the manifest is trusted and left alone
(re-linked only if it vanished); a skill with no prior record gets a
pre-existing REAL directory backed up to `<name>.pre-ccmemory.bak` once.
