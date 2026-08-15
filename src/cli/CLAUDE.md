# cli

The composition shell: turns `argv` into one `CliOutcome`, which `main.ts` is
the sole place that maps to a process exit. Every other module's command
class returns a `CliOutcome` rather than exiting the process itself.

Owns: argument parsing (`args/` — `CliCommand`, one `*Args` type per
subcommand, `parseArgs`), `-h`/`--version` (`help/`'s `HelpCommand`), and
`main.ts` — the only file that constructs a real `AppContainer` and every
command class, and dispatches a parsed command to one of them.

`CliOutcome` itself, its exit-code constants, and `cliFailure`/`cliOutcome`
live in `core/` (every module returns a `CliOutcome`, not just this one) —
import them from `@/core/index.ts`, never through here. Every per-command
output formatter lives beside the command that owns it (e.g.
`workspace/commands/workspace/workspace.formatter.ts`), not in this module —
this module renders nothing except its own `-h`/`--version` usage text.

`main.ts` keeps that exact name and path rather than `cli.main.ts`: both
`package.json`'s build script and `quality/purity.test.ts`'s composition-root
allowlist hardcode `src/cli/main.ts`, and neither is editable from here.

`args/`'s parser is hand-written because `node:util.parseArgs` cannot express
a required, space-separated variadic list (`--match ~/a ~/b`), which several
subcommands need; every flag is expected AFTER its command's positional
argument(s). `help/`'s usage text is not parsed by any skill, so its wording
is free to change — what is required is that both exit 0 and `--help` lists
the real command surface.
