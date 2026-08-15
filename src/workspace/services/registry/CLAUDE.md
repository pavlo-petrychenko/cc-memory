# registry

Reads, writes and validates `~/.claude/memory/registry.toml`, the file that maps
workspace ids to their vault/worklog/index paths.

Owns: `defaultRegistryPath`, `loadRegistry`/`saveRegistry`, `findWorkspace`,
`expandWorkspace` (raw `~`-relative fields → absolute `AbsPath`s), and
`validateNew` (conflict checks against the existing registry).

A workspace is stored `~`-relative for portability; only `expandWorkspace` produces
paths safe to touch on disk. A missing registry file is an empty list, not an
error — only a present-but-broken file is a `RegistryError`. Writes go through
`saveRegistry`, which serializes via the sibling `registryToml` module and writes
atomically (`.tmp` + rename).
