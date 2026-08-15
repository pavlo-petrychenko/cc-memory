# session

The 5 Claude Code hooks (`SessionStart`, `UserPromptSubmit`/memory-inject,
`Stop`/wrap-gate, `SessionEnd`/worklog-floor, `PostCompact`) and the fail-open
runtime they all share via `runtime/`'s `HookRuntimeService`: resolve exactly
one workspace for the cwd or go silent, run the handler, render the result,
always exit 0.

`payload/`'s `PayloadParser` parses untrusted hook stdin into typed payloads;
`runtime/` is the shared preamble (`HookRuntimeService`) and the `HookResult`
-> JSON protocol (`HookResultSerializer`) — no hook handler in `hooks/` builds
its own `Container`/`Config` or calls `process.exit` directly, that
discipline lives here once; each `hooks/<name>/` folder is one handler;
`commands/hookDispatch/` is the `memory hook <name>` CLI subcommand that wires
a name to its handler, and is the only place that builds a REAL `Container`.

`HookName` here and `install/settings.ts`'s registration table must name the
same 5 hooks — a mismatch fails open (memory silently not working), never
loudly, so `dispatchableHookNames` exists for `install/` to pin against.

Per-hook notes: `payload/`'s `parseTolerantJson` never throws — empty input,
invalid JSON, and JSON parsing to something other than an object all fold to
`{}` — which is what lets every hook stay fail-open even on garbage stdin.
`sessionStart` swallows a reindex failure (a stale index beats a broken
`SessionStart`). `memoryInject` logs every candidate pool to `inject.jsonl`
with keep-2 rotation, disabled via `CCMEM_INJECT_LOG=0`. `wrapGate`'s state
lives in one `wrap-state.json` per workspace, keyed by session id and pruned
of entries older than 7 days on every write. `worklogFloor` and
`compactCheckpoint` are write-only — a write failure is swallowed as
best-effort, and `compactCheckpoint` is a no-op when the summary is empty.
