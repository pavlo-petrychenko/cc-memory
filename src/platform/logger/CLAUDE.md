# logger

The `Logger` port: diagnostics for the fail-open invariant. Hooks and the CLI
catch everything and always exit 0, so a broken memory system would
otherwise be indistinguishable from a quiet one — this lets them log first.

The real adapter is a size-capped, rotating file: a write that would push the
live file past `MAX_LOG_BYTES` rotates it through `KEPT_GENERATIONS` numbered
backups (lower number = more recent) before writing. `appendWithRotation` is
exported standalone, not only via `Logger`, because the same rotation
primitive also backs writes that aren't a leveled log message. Level
filtering against the configured threshold happens once, at construction.
