# Phase 7: Split Hooks to Module Resolvers

## Dependencies

- Phase 5, Phase 6

## Can Parallel With

- Nothing (Phase 8 registers the result)

## Objective

Convert the five hooks to thin `@Hook` resolvers and re-home them into their
domain modules under `resolvers/hooks/`. Delete `src/modules/session/` at the end
of this phase (its transport files already moved to `core/transport/hook/` in
Phase 3; its `hook` dispatch command is replaced by `main.ts` dispatch in Phase 8).

## Hook → resolver map

| Hook name | Event | Resolver file | Handler use case |
|---|---|---|---|
| `session-start` | `SessionStart` | `memory/resolvers/hooks/sessionStart.hook.ts` | `SessionStartUseCase` |
| `memory-inject` | `UserPromptSubmit` | `memory/resolvers/hooks/injectMemory.hook.ts` | `InjectMemoryUseCase` |
| `wrap-gate` | `Stop` | `worklog/resolvers/hooks/wrapGate.hook.ts` | `WrapGateUseCase` |
| `worklog-floor` | `SessionEnd` | `worklog/resolvers/hooks/worklogFloor.hook.ts` | `WriteStateFloorUseCase` |
| `compact-checkpoint` | `PostCompact` | `worklog/resolvers/hooks/compactCheckpoint.hook.ts` | `AppendCompactUseCase` |

`worklog-floor`'s current class is `SessionEndHook` (file `sessionEnd.hook.ts`) —
rename the file/class to `worklogFloor.hook.ts`/`WorklogFloorHook`; the **name
string stays `worklog-floor`**.

## Resolver shape (thin)

```typescript
import { Hook } from "@/core/index.ts";

@Hook({
  name: HookName.SessionStart,
  event: HookEvent.SessionStart,
  timeoutSeconds: 10,
  Handler: SessionStartUseCase,
  mapOptions: (payload, ctx) => ({ workspace: ctx /* resolved by the runtime */ }),
})
export class SessionStartHook {}
```

The use case's `execute` returns a `HookResult` (`silent`/`context`/`block`)
exactly as today. **Fail-open and the stdout envelope stay in
`core/transport/hook/hook.runtime.ts` + `hookResult.serializer.ts`** — the hook
path never calls `process.exit`; the runtime's `finally { stdio.exit(0) }` is the
only exit.

## Move the hook files

- `session/hooks/sessionStart/*` → `memory/resolvers/hooks/sessionStart.hook.ts`
  (+ `.test.ts`, `.constants.ts`)
- `session/hooks/memoryInject/*` → `memory/resolvers/hooks/injectMemory.hook.ts`
  (+ `.test.ts`, `.constants.ts`, `.typedefs.ts`, `.formatter.ts` →
  `memory/formatters/memoryInject.formatter.ts`)
- `session/hooks/wrapGate/*` → `worklog/resolvers/hooks/wrapGate.hook.ts`
  (+ `.test.ts`, `.constants.ts`, `.typedefs.ts`, `.formatter.ts` →
  `worklog/formatters/wrapGate.formatter.ts`)
- `session/hooks/compactCheckpoint/*` → `worklog/resolvers/hooks/compactCheckpoint.hook.ts`
  (+ `.test.ts`, `.typedefs.ts`, `.formatter.ts` →
  `worklog/formatters/compactCheckpoint.formatter.ts`)
- `session/hooks/sessionEnd/*` → `worklog/resolvers/hooks/worklogFloor.hook.ts`
  (+ `.test.ts`, `.constants.ts`)

`wrapGate`/`compactCheckpoint`/`worklogFloor` formatters join the existing
`worklog/formatters/` (flattened from their current `formatters/<name>/` dirs).

## Delete `src/modules/session/`

After the moves: `hooks/*` gone (Phase 7), `runtime/`/`payload/`/`session.*` gone
(Phase 3), `entity.ts` gone (Phase 5 → `worklog/repositories/wrapState.repository.ts`).
The only thing left is `commands/hookDispatch/` — remove it now; `memory hook <name>`
dispatch moves into `main.ts` in Phase 8.

## Tests

- Move each `.hook.test.ts` + `.formatter.test.ts` beside its new resolver.
- Keep `core/transport/hook/hook.failopen.test.ts` green (spawns
  `dist/memory.js hook <name>`; must still exit 0 for garbage stdin).
- `install.hookNameAgreement.test.ts` still passes (dispatcher ↔ installer).

## Acceptance Criteria

- [ ] All 5 hooks in `memory/resolvers/hooks/` / `worklog/resolvers/hooks/` with
  `@Hook` carrying `name`/`event`/`timeoutSeconds`
- [ ] Every `.hook.ts` carries `@Hook` (kept true for `registries.test.ts`)
- [ ] `HookName`/`HookEvent`/`HookResult`/`HookResultSerializer` unchanged
- [ ] `src/modules/session/` deleted
- [ ] `memory hook <name>` still fail-open (exit 0) for every name and unknown names
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 8 (registry + main.ts).
