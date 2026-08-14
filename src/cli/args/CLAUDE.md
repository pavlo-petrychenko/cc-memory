# cli/args

The hand-written CLI argument parser: `CliCommand`, one `*Args` type per
subcommand, `ParsedArgs`, `ArgsError`, and `parseArgs`. Hand-written because
`node:util.parseArgs` cannot express a required, space-separated variadic list
(`--match ~/a ~/b`), which several subcommands need.

Every flag is expected AFTER its command's positional argument(s) — this
parser does not support a flag preceding a positional. Nothing this CLI does
needs that generality.
