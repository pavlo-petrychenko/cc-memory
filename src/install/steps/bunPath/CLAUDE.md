# bunPath

Resolves the REAL `bun` binary at install time via `readlink -f $(which
bun)`, verified to still exist on disk — never an ephemeral path a version
manager's per-session shim (`fnm`, `asdf`, …) would otherwise hand out.

Refuses rather than guessing on any failure along the way: not found on
`PATH`, `readlink` failing, or the resolved path not actually existing all
return a typed `BunPathError` instead of recording something unreliable.
