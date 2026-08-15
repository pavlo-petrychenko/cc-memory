# config

Parses every `CCMEM_*` tunable out of a process environment snapshot into one
typed `Config`, applying defaults for anything unset or malformed.

Owns `Config`, `EnvSnapshot`, the `LogLevel` enum, and the `CCMEM_*` env var
names and defaults. Never reads `process.env`/`Bun.env` itself — the snapshot
always arrives as a parameter, so a bad tunable can never crash a hook.
