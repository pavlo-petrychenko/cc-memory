# cli

The composition shell: turns `argv` into one `CliOutcome`, which `main.ts` is
the sole place that maps to a process exit. Every other module's command
function returns a `CliOutcome` rather than exiting the process itself.

Owns: argument parsing (`args/`), the shared `CliOutcome` type and constants
(`cli.typedefs.ts`, `cli.constants.ts`), exit-code helpers (`outcome/`),
workspace-or-cwd target resolution shared by several commands
(`targetResolution/`), `-h`/`--version` (`help/`), and the command output text
every skill parses verbatim (`cli.formatter.ts`).

`main.ts` keeps that exact name and path rather than `cli.main.ts`: both
`package.json`'s build script and `quality/purity.test.ts`'s composition-root
allowlist hardcode `src/cli/main.ts`, and neither is editable from here.
