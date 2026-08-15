# hookDispatch

`memory hook <name>` — the one CLI subcommand that dispatches to the 5 real
hook handlers by `HookName`, via the shared `runHook` preamble/postamble. An
unknown name stays fail-open (exit 0, a stderr diagnostic) rather than
erroring, since this same path is what `settings.json` invokes as a live hook.

`hook()` is the only place in this module that builds a REAL `Container`; the
container-injected `dispatchHook()` is what every test exercises instead.
`dispatchableHookNames` is exported so `install/` can assert its
`settings.json` registration table stays in sync with this dispatch table.
