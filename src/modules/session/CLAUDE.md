# modules/session

The five Claude Code hooks and their shared fail-open runtime.

`payload/` parses untrusted stdin; `runtime/` is the shared preamble that always
exits 0; `hooks/` are the five handlers; `commands/hookDispatch` is
`memory hook <name>`. Owns `wrap-state.json` and the inject/inject.jsonl
diagnostics. A mis-wired hook fails silently — `session.failopen.test.ts` is the
guard.
