# Phase 3: Hook Transport Extraction

## Dependencies

- Phase 1 (base classes)

## Can Parallel With

- Phase 2 (CLI transport) — different files, no overlap

## Objective

Move the hook runtime, payload parsing and serialization out of
`src/modules/session/` into `src/core/transport/hook/`. **Fail-open behavior and
the stdout JSON envelope are frozen (invariant #3, contract C2) — move them
verbatim.** The runtime file is named `hook.runtime.ts` (the proposal's name).

## Reality check (what actually exists)

`src/modules/session/` contains:

- `session.runner.ts` — `HookRuntimeService` (try/catch/finally → `stdio.exit(0)`).
- `session.typedefs.ts` — `HookEvent`, `HookResultKind`, `HookResult`, `HookName`.
- `session.constants.ts` — the five `HOOK_DESCRIPTORS` (consumed by the installer).
- `runtime/runtime.typedefs.ts` — `HookContext`, `HookInput`, `HookHandler`.
- `runtime/hookResult.serializer.ts` — `HookResultSerializer`.
- `payload/payload.parser.ts` + `payload/payload.typedefs.ts`.

## Files to Create (all verbatim moves)

| From | To |
|------|-----|
| `session/session.runner.ts` | `core/transport/hook/hook.runtime.ts` |
| `session/session.typedefs.ts` + `runtime/runtime.typedefs.ts` | `core/transport/hook/hook.typedefs.ts` |
| `session/session.constants.ts` | `core/transport/hook/hook.constants.ts` |
| `session/runtime/hookResult.serializer.ts` | `core/transport/hook/hookResult.serializer.ts` |
| `session/payload/payload.parser.ts` | `core/transport/hook/payload.parser.ts` |
| `session/payload/payload.typedefs.ts` | `core/transport/hook/payload.typedefs.ts` |

`hook.typedefs.ts` merges the enums + `HookResult` with `HookContext`/`HookInput`/
`HookHandler`. `HookName`'s five values are `session-start`, `memory-inject`,
`wrap-gate`, `worklog-floor`, `compact-checkpoint` — **do not rename** (the
installer writes `hook <name>` into `settings.json`; `install.hookNameAgreement.test.ts`
pins the agreement).

Re-export through `src/core/index.ts` (no `hook/index.ts`).

## Required quality-gate migration

`src/quality/fileKinds.test.ts` — add `.runtime.ts` to `ALLOWED_SUFFIXES`.

## Implementation Steps

1. Create `src/core/transport/hook/` with the six files above.
2. Update imports in the 5 hook files under `src/modules/session/hooks/*`.
3. Update `hookDispatch.command.ts` and `session/index.ts`.
4. Update `installation/install.useCase.ts`, `doctor/doctor.useCase.ts`,
   `steps/settings/settings.repository.ts` (`HOOK_DESCRIPTORS` import).
5. Move `session.failopen.test.ts` and `session.runner.test.ts` to
   `core/transport/hook/` with updated imports.
6. Keep `src/modules/session/` in place (deleted in Phase 7).

## Acceptance Criteria

- [ ] `src/core/transport/hook/` holds `hook.runtime.ts`, typedefs, serializer,
  parser, payload typedefs, constants
- [ ] `HookRuntimeService.run` is byte-for-byte fail-open (catch → log → `finally`
  → `stdio.exit(0)`)
- [ ] `HookName` values and `HOOK_DESCRIPTORS` order unchanged
- [ ] `.runtime.ts` in `fileKinds.test.ts` `ALLOWED_SUFFIXES`
- [ ] `session.failopen.test.ts` and `install.hookNameAgreement.test.ts` pass
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 4 (decorators). Phase 2 runs in parallel.
