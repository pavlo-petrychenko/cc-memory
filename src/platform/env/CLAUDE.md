# env

The `Env` port: `$HOME`, `$PWD` and every `CCMEM_*` tunable, read through here
rather than `process.env`/`Bun.env` directly, so a test supplies a fake
instead of mutating the real process environment.

`home()`/`cwd()` return an `AbsPath` directly — `os.homedir()` and
`process.cwd()` are always absolute already, so there is nothing for
`core/paths.ts` to expand.
