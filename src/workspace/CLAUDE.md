# workspace

The workspace registry and cwd-to-workspace resolution: the isolation boundary
that decides which single workspace (if any) a session belongs to.

- `services/registry` — reads/writes `registry.toml`, expands `~`-relative
  fields, validates a candidate against existing workspaces.
- `services/resolver` — longest-`match`-prefix resolution and worktree slugs.
- `serializers/registryToml` — the byte-exact TOML writer.
- `commands/workspace`, `commands/resolve` — the `memory workspace …` and
  `memory resolve` CLI subcommands.

`RegistryError`/`RegistryConflict` (and their kind enums) live in
`workspace.typedefs.ts` at module root since both `services/registry` and
outside callers (e.g. `install/doctor`) need them.
