# runtime

The shared preamble/postamble every hook runs through: `runHook` reads stdin,
tolerantly parses it, resolves exactly one workspace for the cwd (or goes
silent — the cwd-to-workspace isolation boundary), invokes the event's
`HookHandler`, renders the `HookResult` through `serializeHookResult` to the
stdin/stdout protocol, and always exits 0 having logged any failure.

`HookContext`/`HookHandler` live in `runtime.service.ts`, not a `.typedefs.ts`
file: `HookContext` embeds the real `Container`, so a type-only file could
never define it without itself depending on `platform/`.

No hook handler in `hooks/` builds its own `Container`/`Config` or calls
`process.exit` directly — that discipline lives here, once.
