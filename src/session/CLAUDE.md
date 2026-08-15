# session

The 5 Claude Code hooks (`SessionStart`, `UserPromptSubmit`/memory-inject,
`Stop`/wrap-gate, `SessionEnd`/worklog-floor, `PostCompact`) and the fail-open
runtime they all share via `runtime/runHook`: resolve exactly one workspace
for the cwd or go silent, run the handler, render the result, always exit 0.

`payload/` parses untrusted hook stdin into typed payloads; `runtime/` is the
shared preamble and the `HookResult` -> JSON serializer; each `hooks/<name>/`
folder is one handler; `commands/hookDispatch/` is the `memory hook <name>`
CLI subcommand that wires a name to its handler.

`HookName` here and `install/settings.ts`'s registration table must name the
same 5 hooks — a mismatch fails open (memory silently not working), never
loudly, so `dispatchableHookNames` exists for `install/` to pin against.
