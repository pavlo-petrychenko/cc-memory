# Phase 5: Promote Orphan Use Cases → Services; Extract kb/

## Dependencies

- Phase 2, 3, 4

## Can Parallel With

- Nothing (Phase 6 builds on the services created here)

## Objective

Fold the six use cases that have no resolver into services, extract the `kb/`
module, and introduce the `note`/`worklog`/`memory`/`installation` services and
repositories. After this phase every remaining use case maps 1:1 to a resolver
(created in Phases 6–7), and cross-module logic is exposed as **services**.

## 1. Fold orphan use cases into services

| Use case (deleted) | Service method |
|---|---|
| `note/useCases/reprojectNotes.useCase.ts` | `note/services/note.service.ts` — `incrementalReindex()` / `fullReindex()` |
| `note/useCases/searchNotes.useCase.ts` | `note/services/note.service.ts` — `search()` |
| `worklog/useCases/reprojectWorklog.useCase.ts` | `worklog/services/worklog.service.ts` — `reindex()` |
| `worklog/useCases/searchWorklog.useCase.ts` | `worklog/services/worklog.service.ts` — `search()` |
| `workspace/useCases/resolveTargetWorkspaces.useCase.ts` | `workspace/services/targetResolution.service.ts` — `resolveTarget()` |
| `note/useCases/buildKbMap.useCase.ts` | `kb/services/kbMap.service.ts` — `build()` |

The method bodies move **verbatim** from the deleted use cases — output shapes
(pinned by `golden/cli/reindex-all`, `search-kryptonite`, `notes-json`) must not
change.

## 2. Extract `kb/` from `note/`

```
kb/
  CLAUDE.md, index.ts
  kbMap.typedefs.ts                      # KbMapInput, KbMapFeature
  services/kbMap.service.ts              # build() — was KbMapService in note/kbMap.repository.ts
  repositories/kb.repository.ts          # vault/feature reads — split out
  formatters/kbMap.formatter.ts          # was note/services/kbMap.formatter.ts
```

`kb/` has **no use cases and no resolvers** — it is consumed by `memory/` via
`kbMap.service` (imported through `@/modules/kb/index.ts`).

## 3. Introduce services/repositories

- `note/services/note.service.ts` — `search()`, `incrementalReindex()`,
  `fullReindex()` (from the folded use cases). Note: `note.parser.ts`,
  `note.repository.ts`, `note.projection.ts`, `note.query.ts` stay.
- `worklog/services/worklog.service.ts` — `search()`, `reindex()`,
  `readWorkingMemory()`. Split the current `WorklogStoreService` (today in
  `worklog/worklog.repository.ts`) into `worklog/services/worklogStore.service.ts`
  (`readState()`/`appendToDated()`/`statePath()`) + `worklog/repositories/
  worklog.repository.ts` (journal file I/O).
- `worklog/repositories/wrapState.repository.ts` — wrap-state.json CRUD + prune;
  move `session/session.entity.ts` (`WrapStateEntry`/`WrapStateMap`) here.
- `memory/services/memory.service.ts` — `fusedSearch()` (shared by
  `searchMemory` and `injectMemory`), composing `note.service.search()` +
  `worklog.service.search()`.
- `memory/repositories/injectLog.repository.ts` — inject.jsonl append + rotation
  (extract the inject-log writes currently inside `memoryInject.hook.ts`).
- `installation/services/install.service.ts` + `doctor.service.ts` — move the
  logic out of today's mislabeled `install.useCase.ts` (`InstallService`) and
  `doctor/doctor.useCase.ts` (`DoctorService`).

## 4. Make remaining use cases extend `UseCase`

Each remaining use case becomes `class X extends UseCase<In, Out>`, takes
`ctx: AppContext`, and builds its dependencies in its constructor via
`this.makeService(...)`/`this.makeRepository(...)`/`this.makeProjection(...)` —
or, where a service keeps explicit constructor args, via `new` with
`ctx.gateways.*`. The 16 surviving use cases:

- `workspace/useCases/`: addWorkspace, removeWorkspace, listWorkspaces,
  resolveWorkspace
- `note/useCases/`: listNotes
- `worklog/useCases/`: commitWorklog, wrapGate, appendCompact, writeStateFloor
- `memory/useCases/`: searchMemory, reindexMemory, sessionStart, injectMemory
- `installation/useCases/`: install, uninstall, doctor

## Tests

- Move/rewrite the deleted use cases' tests into the corresponding service tests
  (`note.service.test.ts`, `worklog.service.test.ts`, `targetResolution.service.test.ts`,
  `kbMap.service.test.ts`).
- Add tests for the new services/repos (`worklogStore.service`, `wrapState.repository`,
  `memory.service`, `injectLog.repository`, `install.service`, `doctor.service`).
- Update `cli.wiring.ts` + `hookDispatch.command.ts` imports (still the wiring
  consumers this phase).

## Acceptance Criteria

- [ ] Six orphan use cases deleted; their logic lives in the named service methods
- [ ] `kb/` module exists (service, repository, formatter, typedefs, `index.ts`,
  `CLAUDE.md`); `note/index.ts` no longer exports KB-map symbols
- [ ] `note.service`, `worklog.service`, `worklogStore.service`, `memory.service`,
  `install.service`, `doctor.service`, `wrapState.repository`, `injectLog.repository`
  exist
- [ ] Remaining use cases extend `UseCase` and take `AppContext`
- [ ] No use case is imported by another use case or a service
- [ ] `reindex-all`, `search-kryptonite`, `notes-json` goldens byte-identical
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 6 (move CLI commands to module resolvers + convert to `@Command`).
