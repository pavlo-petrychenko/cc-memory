# cli/targetResolution

Resolves the `Workspace`(s) a command should act on, both returning a
`Result` a command matches on and turns into a `CliOutcome` itself rather
than terminating the process here.

- `resolveTargetWorkspaces` — one-by-id or every registered workspace
  (`reindex`, `commit`).
- `resolveWorkspaceForCwd` — exactly one, by explicit `--workspace` id or
  longest-prefix `cwd` match (`search`, `notes`).
- `loadRegistryForCli` — loads the registry, mapping a `RegistryError`
  straight to a `CliOutcome` failure.
