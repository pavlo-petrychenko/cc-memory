# commands/install

`memory install [--dry-run]` / `memory uninstall` — the CLI surface over
`install.service.ts`'s `runInstall`/`runUninstall`.

`install`/`uninstall` take `container` as an optional trailing parameter,
defaulting to a real one, since `cli/main.ts` dispatches to them with no
container argument at all (unlike every other command). A test always
supplies an explicit fake container instead of relying on that default —
the real one mutates this machine's actual home directory.
