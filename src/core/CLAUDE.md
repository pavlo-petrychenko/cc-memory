# core

The shared kernel: vocabulary and dependency-free helpers every module may use.
No module may be imported *by* core — it depends on nothing else in `src/`.

Owns `AbsPath`, `Result`, `JsonValue`/`JsonRecord` (`core.typedefs.ts`);
`RawWorkspace`/`Workspace`/`WorktreeSlug` (`domain.typedefs.ts`); env-tunable
parsing (`config/`); path/slug string helpers (`utils/`); and the `CliOutcome`
builders (`outcome/`).

`Workspace` types live here rather than in a `core/workspace/` submodule, to
avoid confusion with the top-level `workspace/` module that resolves and
persists them.

`config/` never reads `process.env`/`Bun.env` itself — the `EnvSnapshot` always
arrives as a parameter, so a bad tunable can never crash a hook. `outcome/`
gives a command two ways to build a `CliOutcome` other than the literal
`CLI_SUCCESS`: `cliFailure` (a failure message on stderr, non-zero exit by
default) and `cliOutcome` (an explicit exit code paired with an optional
stderr diagnostic, for commands that must always exit 0). `utils/paths`'
`absPath`/`tryAbsPath` hold the codebase's ONE `as AbsPath` type assertion —
every other path here, and every caller elsewhere in `src/`, reaches an
`AbsPath` by validating a string through one of these two rather than
asserting directly. `utils/slug`'s `sanitizeSlug` always returns either
`_root` or a string of `[A-Za-z0-9._-]` (plus Unicode letters/digits) — never
empty.
