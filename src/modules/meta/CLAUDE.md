# modules/meta

The help and version commands: render the CLI surface and the installed
version. Depends only on core and the command descriptors; holds no state.

- `useCases/` — help, version
- `commands/` — `-h`/`--help` and `-V`/`--version` resolvers
