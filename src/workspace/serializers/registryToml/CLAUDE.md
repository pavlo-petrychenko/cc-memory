# registryToml

Serializes `RawWorkspace[]` back into `registry.toml` text.

Owns `serializeRegistry`, byte-exact and deliberately hand-rolled rather than
using `smol-toml`'s stringifier: this file is user-owned and rewritten in
place on every `memory workspace add|rm`, so its formatting must stay stable
or the user sees spurious diffs in their own registry. Reading the registry
still goes through `smol-toml` (`services/registry`) — only writing our fixed
six-field schema is hand-rolled.
