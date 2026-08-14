# cli/outcome

`cliFailure`/`cliOutcome`: the two ways a command builds a `CliOutcome` other
than the literal `CLI_SUCCESS` (`cli.constants.ts`), plus the exit codes they
use. `cliFailure` is a failure message on stderr, non-zero exit by default;
`cliOutcome` is the fail-open shape — an explicit exit code paired with an
optional stderr diagnostic, for commands that must always exit 0.
