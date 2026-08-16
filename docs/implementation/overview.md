# Implementation Plan Overview

> This revision restores the proposal's resolver architecture and aligns it with
> the code as it exists today. The goal — base classes with DI, `@Command`/`@Hook`
> decorators, a split transport layer, an explicit registry, and thin per-module
> resolvers — is unchanged. Every path, inventory and sequence below has been
> verified against the tree and the structural quality tests.

## The architecture rules (non-negotiable)

1. **A use case is used only by a resolver** — never by another use case or a
   service.
2. **A resolver lives in the same module as the use case it invokes** and is a
   **thin layer**: a `@Command`/`@Hook` class with a `Handler` (the use case) and a
   `mapOptions` that maps argv/payload → options. No logic.
3. **Logic with no resolver is a service/repository/projection/formatter**, not a
   use case. Use cases compose those via `makeService`/`makeRepository`/
   `makeProjection`.
4. Cross-module dependencies are **services** (e.g. `workspaceResolver.service`,
   `targetResolution.service`, `kbMap.service`) imported through the module barrel.

## The goal (unchanged, with resolvers restored)

```
src/
  core/
    base/          useCase.base.ts, service.base.ts, repository.base.ts, projection.base.ts,
                   context.typedefs.ts, constructor.typedefs.ts
    decorators/    command.decorator.ts, hook.decorator.ts
    transport/
      cli/         cli.runner.ts, cli.typedefs.ts, cli.utils.ts, cli.constants.ts
      hook/        hook.runtime.ts, hook.typedefs.ts, hookResult.serializer.ts,
                   payload.parser.ts, payload.typedefs.ts, hook.constants.ts
    config/ search/ utils/   (unchanged)
  gateways/                  (unchanged)
  modules/
    registry.ts             explicit command+hook lists
    workspace/  note/  worklog/  kb/  memory/  installation/  meta/
      — each with useCases/, services/, repositories/, projections/,
        formatters/, and resolvers/{commands,hooks}/ as applicable
  main.ts                   the entry (moved up from cli/main.ts)
```

Deleted: `src/cli/`, `src/modules/session/`, `src/core/entry/`.

## Alignment decisions (changes from the original plan)

1. **`core/domain/config` → `core/config`.** Config lives at `src/core/config/`
   (`config.typedefs.ts`, `config.parser.ts`, `config.constants.ts`); `Workspace`
   lives in `core/domain.typedefs.ts`, `AbsPath` in `core/core.typedefs.ts`. The
   proposal nests config under `core/domain/` — kept as reality to avoid an
   import-churn move. (Flagged: adopt `core/domain/config/` if you want the
   literal proposal.)
2. **The entry is `src/cli/main.ts`, not `src/main.ts`.** Build is
   `bun build src/cli/main.ts --target=bun --outfile dist/memory.js`. Final
   `main.ts` moves to `src/main.ts`; build script, shim and test utils update in
   the same phase (Phase 8).
3. **Decorators already exist — this plan replaces their API.** Today
   `@Command(CommandDescriptor)` + `Command<TOptions>` (`parse`/`run`) and
   `@Hook(HookDescriptor)` live in `src/core/entry/`. The target is
   `@Command({ path, usage, summary, hidden, Handler, mapOptions, PostProcessing })`
   and `@Hook({ name, event, timeoutSeconds, Handler, mapOptions })`, keeping the
   descriptor metadata (`usage`/`summary`/`hidden`, `event`/`timeoutSeconds`)
   because `--help` and the installer consume it, and `mapOptions` returns
   `Result<Options, ArgsError>` so argument-parse failures still exit 2.
4. **No nested `index.ts` barrels.** `fileKinds.test.ts` forbids any `index.ts`
   below a module root (`core/` is the root). `core/base/`, `core/decorators/`,
   `core/transport/*` have no `index.ts`; their exports are re-exported through
   `src/core/index.ts`.
5. **Orphan use cases fold into services.** `reprojectNotes`, `searchNotes` →
   `note/service/note.service.ts`; `reprojectWorklog`, `searchWorklog` →
   `worklog/service/worklog.service.ts`; `resolveTargetWorkspaces` →
   `workspace/services/targetResolution.service.ts`; `buildKbMap` →
   `kb/services/kbMap.service.ts`. Every remaining use case maps 1:1 to a resolver.
6. **DI is additive.** `UseCase`/`Service`/`Repository`/`Projection` bases take
   `AppContext { gateways, config }`. Existing repositories/projections keep their
   explicit constructor arguments; use cases take `AppContext` (required by
   `new Handler(ctx)`) and build dependencies inside their constructor.
7. **Hook dispatch stays fail-open and typed.** Phase 8's original `main.ts` did
   `process.exit(1)` on an unknown hook — that breaks invariant #3. Hooks route
   through `hook.runtime.ts` (`HookRuntimeService`: try/catch/finally →
   `stdio.exit(0)`; unknown hook → log + exit 0), and the `HookResult`
   (`silent`/`context`/`block`) + `HookResultSerializer` stdout envelope is
   preserved verbatim (contract C2).
8. **`registry.ts`** (proposal's name, not `registry.wiring.ts`) with the required
   quality-gate migrations listed below.

## Non-negotiable constraints (every phase)

- **Invariant #3 — hooks fail open.** `memory hook <name>` always exits 0; a thrown
  handler, bad stdin, a malformed registry, or an unknown hook name must never
  produce a non-zero exit or a crash trace. Never call `process.exit` on the hook
  path; go through `container.stdio.exit(0)`.
- **C2 — hook stdin/stdout JSON.** The stdout envelope (`hookSpecificOutput`/
  `decision`) and tolerant stdin parsing are pinned by tests; do not change them.
- **C3 — CLI surface.** `--help`, `search`, `reindex`, `notes`, `workspace`,
  `commit`, `resolve`, `install`, `uninstall` output is pinned by
  `src/testing/golden/cli/*` and `src/cli/main.test.ts`. Moving files must not
  change a single emitted string.
- **C6 — installed surface.** `~/.local/bin/memory` shim executes `dist/memory.js`.
  The entry move (Phase 8) updates `package.json#build`, the shim step, and
  `src/testing/utils/buildDist.utils.ts` / `runCli.utils.ts` together.
- **`bun run check` after every phase** from a clean `dist/`.

## Required quality-gate migrations

| Gate | Change | Phase |
|---|---|---|
| `fileKinds.test.ts` | add `.base.ts` **and `.runtime.ts`** to `ALLOWED_SUFFIXES` | 1, 3 |
| `fileKinds.test.ts` | add `registry.ts` to `ALLOWED_EXACT_NAMES`; add `modules` to `NO_BARREL_ROOTS` | 8 |
| `docs.test.ts` | exclude top-level `main.ts` and `modules/registry.ts` from the module-root rule (like `version.ts`) | 8 |
| `purity.test.ts` | `COMPOSITION_ROOTS`: `{"cli/main.ts"}` → `{"main.ts", "modules/registry.ts"}` | 8 |
| `registries.test.ts` | point `wireCli`/`--help` assertion at `modules/registry.ts` | 8 |

## Phases & dependencies

```
Phase 1: Base classes + AppContext DI                 (additive)
    ↓
Phase 2: CLI transport  ⇄  Phase 3: Hook transport     [PARALLEL]
    ↓                        ↓
Phase 4: @Command / @Hook decorator API                (depends on 1)
    ↓
Phase 5: Promote orphan use cases → services; extract kb/; introduce note/worklog/memory services
    ↓
Phase 6: Move CLI commands → module resolvers/commands/ + convert to @Command
    ↓
Phase 7: Split hooks → module resolvers/hooks/ + convert to @Hook; delete session/
    ↓
Phase 8: registry.ts + main.ts; delete core/entry/ + cli/; finalize
```

| Phase | Depends On | Can Parallel With | Est. Complexity |
|-------|-----------|-------------------|-----------------|
| 1. Base classes | — | — | Low |
| 2. CLI transport | 1 | 3 | Medium |
| 3. Hook transport | 1 | 2 | Medium |
| 4. Decorators | 1 | 2, 3 | Medium |
| 5. Promote services | 2, 3, 4 | — | High |
| 6. Move commands | 5 | — | High |
| 7. Split hooks | 5, 6 | — | High |
| 8. Registry + main.ts | 6, 7 | — | Medium |

## Folded use cases (deleted in Phase 5)

| Use case (deleted) | Logic moves to |
|---|---|
| `reprojectNotes.useCase.ts` | `note/services/note.service.ts` (`incrementalReindex()`/`fullReindex()`) |
| `searchNotes.useCase.ts` | `note/services/note.service.ts` (`search()`) |
| `reprojectWorklog.useCase.ts` | `worklog/services/worklog.service.ts` (`reindex()`) |
| `searchWorklog.useCase.ts` | `worklog/services/worklog.service.ts` (`search()`) |
| `resolveTargetWorkspaces.useCase.ts` | `workspace/services/targetResolution.service.ts` (`resolveTarget()`) |
| `buildKbMap.useCase.ts` | `kb/services/kbMap.service.ts` (`build()`) |

## Testing strategy

Each phase: (1) pass the suite before starting; (2) add tests for new code;
(3) move tests with moved files; (4) update imports; (5) `bun run check` from a
clean `dist/`. Regression surface that must stay green: `src/testing/golden/cli/*`,
`src/cli/main.test.ts`, `session.failopen.test.ts`, `install.hookNameAgreement.test.ts`,
and every `src/quality/*.test.ts`.
