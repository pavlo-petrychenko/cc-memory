# modules/workspace

The workspace registry and cwd→workspace resolution — the isolation boundary.

Owns `registry.toml` (the truth): `services/registry` reads/writes it,
`services/resolver` does longest-prefix resolution + worktree slugs,
`serializers/registryToml` writes byte-exact TOML, `targetResolution` gives
commands shared resolvers. Commands: `workspace add|rm|ls`, `resolve`.
