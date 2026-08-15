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

`services/registry`: a missing registry file is an empty list, not an error —
only a present-but-broken file is a `RegistryError`. Writes serialize via
`serializers/registryToml` and write atomically (`.tmp` + rename).
`serializers/registryToml`'s serializer is byte-exact and deliberately
hand-rolled rather than using `smol-toml`'s stringifier, since this file is
user-owned and rewritten in place on every `memory workspace add|rm` — its
formatting must stay stable or the user sees spurious diffs in their own
registry; reading still goes through `smol-toml`. `services/resolver`'s
`worktreeSlug` prefers the git worktree root over a bare `cwd`, falling back
when there is no git repo or the toplevel lies outside the matched prefix.
`targetResolution` gives every command two shared resolvers, both returning a
`Result` a command matches on and turns into a `CliOutcome` itself rather than
terminating the process there: `resolveTargetWorkspaces` (one-by-id or every
registered workspace, for `reindex`/`commit`) and `resolveWorkspaceForCwd`
(exactly one, by explicit `--workspace` id or longest-prefix `cwd` match, for
`search`/`notes`). `commands/resolve`'s `memory resolve` prints a plain
message and still exits 0 for a `cwd` outside every workspace — unlike
`search`/`notes`'s `--workspace`-less miss. `commands/workspace`'s output
strings are a contract — the skills parse `workspace ls` and `workspace add`
output.
