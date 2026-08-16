# Proposed Architecture: Transport Layer Abstraction

Status: **proposal** — not yet implemented.

## Problem Statement

The current architecture has four structural issues that block adding new transports (HTTP, programmatic SDK, etc.) without touching business logic:

1. **CLI commands not in modules** — `search`, `reindex`, `help`, `version` live in `src/cli/commands/` instead of their owning module
2. **`session/` is a monolith** — it's part transport (runtime, serializer, payload parser), part business logic (hook handlers that orchestrate multiple use cases), and part resolver (the hooks themselves)
3. **Use cases call other use cases** — `SessionStartHook` calls `ReprojectNotesUseCase`, `ReprojectWorklogUseCase`, `BuildKbMapUseCase` directly, violating single-responsibility and making each use case untestable in isolation
4. **Manual wiring everywhere** — `cli.wiring.ts` and `hookDispatch.command.ts` both construct their own dependency graphs independently, duplicating module construction

## Design Principles

### One Resolver = One Use Case

A resolver (CLI command or hook) is a thin transport adapter. It serializes a transport-specific payload into a use case's typed input, calls exactly one use case, and serializes the use case's typed output back into the transport's response format.

```
Transport (CLI argv / Hook stdin / HTTP body)
    ↓
Resolver (empty class + decorator — only metadata)
    ↓
Use Case (single business operation — domain types in, domain types out)
    ↓
Service / Repository / Projection (reusable building blocks)
    ↓
Gateway (I/O — the ONLY place touching the outside world)
```

### If it has no resolver, it's a service

Use cases are boundary entry points — they're what the system exposes at its edges. If a piece of logic is only consumed internally by another use case or service, it's a service method, not a use case. This eliminates the orphan-use-case problem where a use case exists without any direct consumer at the system boundary.

### Use cases don't call other use cases

Cross-cutting logic that spans multiple domains lives in a **service** — services can compose other services, repositories, and projections. Use cases consume services.

### Decorator-based resolvers

Resolvers are empty classes with decorators that specify the use case, input mapping, and output processing. No logic in the resolver class body. No factory functions.

### Formatters: presentation vs domain

| Kind | Used by | Example |
|------|---------|---------|
| **Presentation** — format for display (CLI stdout, hook context text) | Resolvers | `KbMapFormatter`, `MemoryInjectFormatter`, `SearchHitFormatter` |
| **Domain** — format content written to files/journals | Use cases or services | `CompactCheckpointFormatter`, `WorklogFloorFormatter` |

Cross-module imports of formatters are OK — they're read-only, no business logic.

### Dependency Rules

```
✅ Allowed:
Resolver → Use Case
Use Case → Service, Repository, Projection
Service  → Service, Repository, Projection, Gateway
Repository → Gateway

❌ Forbidden:
Use Case → Use Case (even within same module)
Resolver → Resolver
Repository → Service
Gateway → anything except stdlib/external libs
```

---

## Dependency Injection Pattern

Based on website/api inheritance-based DI with factory methods.

### Base Classes with Context

Base classes (`UseCase`, `Service`, `Repository`, `Projection`) receive a context object in their constructor:

```typescript
// core/base/useCase.base.ts
export abstract class UseCase<Options, Result> {
  protected gateways: Gateways;
  protected config: Config;
  
  constructor(ctx: AppContext) {
    this.gateways = ctx.gateways;
    this.config = ctx.config;
  }
  
  protected makeService<T extends Service>(ServiceClass: ServiceConstructor<T>): T {
    return new ServiceClass({ gateways: this.gateways, config: this.config });
  }
  
  protected makeRepository<T extends Repository>(RepoClass: RepositoryConstructor<T>): T {
    return new RepoClass({ gateways: this.gateways });
  }
  
  protected makeProjection<T extends Projection>(ProjClass: ProjectionConstructor<T>): T {
    return new ProjClass({ gateways: this.gateways });
  }
  
  abstract execute(options: Options): Promise<Result>;
}
```

### Usage in Use Cases

Use cases declare their dependencies as property initializers using factory methods:

```typescript
// modules/memory/useCases/searchMemory.useCase.ts
export class SearchMemoryUseCase extends UseCase<SearchInput, SearchOutput> {
  private readonly memoryService = this.makeService(MemoryService);
  
  async execute(input: SearchInput): Promise<SearchOutput> {
    const workspace = this.resolveWorkspace(input.cwd);
    return await this.memoryService.fusedSearch(workspace, input.query);
  }
}
```

### Decorator-Based Resolvers

Resolvers are empty classes with decorators that specify the use case, input mapping, and output processing:

```typescript
// modules/memory/resolvers/commands/searchMemory.command.ts
import { Command } from "@/core/decorators/command.decorator.ts";
import { SearchMemoryUseCase } from "../../useCases/searchMemory.useCase.ts";
import { SearchHitFormatter } from "../../formatters/searchHit.formatter.ts";

@Command({
  path: ['search'],
  Handler: SearchMemoryUseCase,
  mapOptions: (argv, ctx) => ({
    query: argv[0],
    cwd: ctx.cwd,
  }),
  PostProcessing: SearchHitFormatter,
})
export class SearchMemoryCommand {}
```

For hooks:

```typescript
// modules/memory/resolvers/hooks/injectMemory.hook.ts
import { Hook } from "@/core/decorators/hook.decorator.ts";
import { InjectMemoryUseCase } from "../../useCases/injectMemory.useCase.ts";
import { MemoryInjectFormatter } from "../../formatters/memoryInject.formatter.ts";
import { HookName } from "@/core/transport/hook/hook.typedefs.ts";

@Hook({
  name: HookName.InjectMemory,
  Handler: InjectMemoryUseCase,
  mapOptions: (payload, ctx) => ({
    prompt: payload.prompt,
    cwd: payload.cwd,
    workspace: ctx.workspace,
  }),
  PostProcessing: MemoryInjectFormatter,
})
export class InjectMemoryHookResolver {}
```

### Decorator Implementation

Decorators store metadata on the class as non-enumerable properties:

```typescript
// core/decorators/command.decorator.ts
export const COMMAND_METADATA = Symbol('command');

export interface FormatterConstructor<T = unknown> {
  new (): { format(input: T): any };
}

export interface CommandParams<UseCaseOptions, UseCaseResult> {
  path: string[];
  Handler: UseCaseConstructor<UseCaseOptions, UseCaseResult>;
  mapOptions: (argv: string[], ctx: AppContext) => UseCaseOptions;
  PostProcessing?: FormatterConstructor<UseCaseResult>;
}

export function Command<UseCaseOptions, UseCaseResult>(
  params: CommandParams<string[], UseCaseResult, UseCaseOptions>
) {
  return function(Ctor: any) {
    Object.defineProperty(Ctor, COMMAND_METADATA, {
      value: params,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return Ctor;
  };
}
```

### Registration: Collected from Modules

Each module exports its decorated resolver classes. `main.ts` imports them all and passes them to a registration function that reads the decorator metadata and creates actual command handlers:

```typescript
// modules/registry.ts
export const commands = [
  // memory
  SearchMemoryCommand,
  ReindexMemoryCommand,
  // worklog
  CommitCommand,
  // workspace
  WorkspaceAddCommand,
  WorkspaceRmCommand,
  WorkspaceLsCommand,
  ResolveCommand,
  // note
  NotesCommand,
  // installation
  InstallCommand,
  UninstallCommand,
  DoctorCommand,
  // meta
  HelpCommand,
  VersionCommand,
];

export const hooks = [
  // memory
  SessionStartHookResolver,
  InjectMemoryHookResolver,
  // worklog
  WrapGateHookResolver,
  CompactCheckpointHookResolver,
  WorklogFloorHookResolver,
];
```

```typescript
// main.ts
import { commands, hooks } from "@/modules/registry.ts";
import { registerCommands } from "@/core/decorators/command.decorator.ts";
import { registerHooks } from "@/core/decorators/hook.decorator.ts";

if (import.meta.main) {
  const gateways = new AppGateways(process.env);
  const config = new ConfigParser().parse(process.env);
  const ctx = { gateways, config };
  
  // Read decorator metadata and create actual handlers
  const commandHandlers = registerCommands(commands, ctx);
  const hookHandlers = registerHooks(hooks, ctx);
  
  // Run CLI or hook dispatch
  const argv = process.argv.slice(2);
  if (argv[0] === 'hook') {
    await dispatchHook(argv[1], hookHandlers, ctx);
  } else {
    await runCli(argv, commandHandlers, ctx);
  }
}
```

The `registerCommands` function:

```typescript
// core/decorators/command.decorator.ts
export function registerCommands(
  commandClasses: any[],
  ctx: AppContext
): CommandHandler[] {
  return commandClasses.map(CmdClass => {
    const params = CmdClass[COMMAND_METADATA];
    if (!params) throw new Error(`${CmdClass.name} has no @Command decorator`);
    
    return {
      path: params.path,
      handler: async (argv: string[], ctx: AppContext) => {
        const useCase = new params.Handler(ctx);
        const options = params.mapOptions(argv, ctx);
        const result = await useCase.execute(options);
        return params.PostProcessing
          ? new params.PostProcessing().format(result)
          : result;
      },
    };
  });
}
```

### Benefits

1. **Empty resolver classes** — no logic in the class body, all configuration in the decorator
2. **No factory functions** — decorators replace `makeCommand`/`makeHook`
3. **Explicit registration** — all commands/hooks listed in `registry.ts`, no magic auto-discovery
4. **Type-safe** — decorator params are typed, use case options are inferred
5. **Testable** — pass a test context with fake gateways

---

## Module Structure

```
src/
  core/
    base/                            # Inheritance-based DI base classes
      useCase.base.ts                # UseCase<Options, Result> — gateways, config, makeService/Repository/Projection
      service.base.ts                # Service — gateways, makeRepository/Projection
      repository.base.ts             # Repository — gateways
      projection.base.ts             # Projection — gateways
      context.typedefs.ts            # AppContext { gateways, config }
      constructor.typedefs.ts        # UseCaseConstructor, ServiceConstructor, etc.

    decorators/
      command.decorator.ts           # @Command decorator + registerCommands
      hook.decorator.ts              # @Hook decorator + registerHooks

    transport/
      cli/
        cli.runner.ts                # matchCommand(), runCli() — argv routing
        cli.typedefs.ts              # CliContext
        cli.utils.ts                 # arg parsing helpers
      hook/
        hook.runtime.ts              # HookRuntime: stdin, workspace resolve, fail-open, exit(0)
        hook.typedefs.ts             # HookHandler, HookInput, HookContext,
                                     #   HookResult, HookResultKind, HookEvent, HookName
        hookResult.serializer.ts     # HookResult → JSON string
        payload.parser.ts            # JSON stdin → typed payload
        payload.typedefs.ts          # SessionStartPayload, MemoryInjectPayload, etc.

    domain/
      domain.typedefs.ts             # Workspace, AbsPath
      config/
        config.parser.ts
        config.typedefs.ts
        config.constants.ts

    search/                          # Pure: no I/O — query building, ranking, tokenization
      ftsQuery/
        ftsQuery.builder.ts
        ftsQuery.constants.ts
      ranking/
        rrf.ranker.ts
        ranking.constants.ts
      tokenizer/
        tokenizer.parser.ts
        tokenizer.constants.ts
      search.typedefs.ts

    utils/
      paths/
        paths.utils.ts
        paths.typedefs.ts
      slug/
        slug.utils.ts
        slug.constants.ts

  gateways/                          # The ONLY place touching the outside world
    fileSystem/
    git/
    sqlite/
    searchIndex/
    proc/
    logger/
    clock/
    env/
    stdio/
    gateways.container.ts
    gateways.typedefs.ts

  modules/
    registry.ts                      # Explicit list of all commands and hooks

    # ===== WORKSPACE =====
    workspace/
      useCases/
        addWorkspace.useCase.ts              # → workspaceAdd.command
        removeWorkspace.useCase.ts           # → workspaceRm.command
        listWorkspaces.useCase.ts            # → workspaceLs.command
        resolveWorkspace.useCase.ts          # → resolve.command
      services/
        workspaceValidator.service.ts
        targetResolution.service.ts          # resolveTarget() — consumed by other modules
        workspaceResolver.service.ts         # resolveWorkspace() — consumed by other modules
      repositories/
        workspace.repository.ts
      resolvers/
        commands/
          workspaceAdd.command.ts
          workspaceRm.command.ts
          workspaceLs.command.ts
          resolve.command.ts

    # ===== KB (knowledge base structure) =====
    # No use cases, no resolvers — only services, repositories, formatters
    # Consumed by memory/ and other modules via kbMapService
    kb/
      services/
        kbMap.service.ts                   # build(), format()
      repositories/
        kb.repository.ts                   # Vault structure scanning
      formatters/
        kbMap.formatter.ts                 # Presentation: KB map text for injection

    # ===== NOTE =====
    note/
      useCases/
        listNotes.useCase.ts                # → notes.command
      services/
        note.service.ts                     # search(), incrementalReindex(), fullReindex()
      repositories/
        note.repository.ts                  # File reads/writes on .md files
      projections/
        note.projection.ts                  # SQLite FTS for notes
      formatters/
        notes.formatter.ts                  # CLI: notes list
      resolvers/
        commands/
          notes.command.ts                  # → listNotes UC

    # ===== WORKLOG =====
    worklog/
      useCases/
        commitWorklog.useCase.ts            # → commit.command
        wrapGate.useCase.ts                 # → wrapGate.hook (Stop)
        appendCompact.useCase.ts            # → compactCheckpoint.hook (PostCompact)
        writeStateFloor.useCase.ts          # → worklogFloor.hook (SessionEnd)
      services/
        worklog.service.ts                  # search(), reindex(), readWorkingMemory()
        worklogStore.service.ts             # readState(), appendToDated(), statePath()
      repositories/
        worklog.repository.ts               # File reads/writes for journals
        wrapState.repository.ts             # wrap-state.json CRUD, prune stale
      projections/
        worklog.projection.ts               # SQLite FTS for worklog
      formatters/
        commit.formatter.ts                 # CLI: commit output
        wrapGate.formatter.ts               # Presentation: nudge/block text
        compactCheckpoint.formatter.ts      # Domain: compact block text for journal
        worklogFloor.formatter.ts           # Domain: floor block text for journal
        workingMemory.formatter.ts          # Presentation: STATE.md for injection
      resolvers/
        commands/
          commit.command.ts                 # → commitWorklog UC
        hooks/
          wrapGate.hook.ts                  # → wrapGate UC
          compactCheckpoint.hook.ts         # → appendCompact UC
          worklogFloor.hook.ts             # → writeStateFloor UC

    # ===== MEMORY (cross-cutting) =====
    memory/
      useCases/
        searchMemory.useCase.ts             # → searchMemory.command
        reindexMemory.useCase.ts            # → reindexMemory.command
        sessionStart.useCase.ts             # → sessionStart.hook (SessionStart)
        injectMemory.useCase.ts             # → injectMemory.hook (UserPromptSubmit)
      services/
        memory.service.ts                   # fusedSearch() — shared by searchMemory + injectMemory
      repositories/
        injectLog.repository.ts             # inject.jsonl append + rotation
      formatters/
        searchHit.formatter.ts              # CLI: search hits
        reindex.formatter.ts                # CLI: reindex output
        memoryInject.formatter.ts           # Presentation: injected context text
        sessionStart.formatter.ts           # Presentation: composes kbMap + workingMemory
      resolvers/
        commands/
          searchMemory.command.ts           # → searchMemory UC
          reindexMemory.command.ts          # → reindexMemory UC
        hooks/
          sessionStart.hook.ts             # → sessionStart UC
          injectMemory.hook.ts             # → injectMemory UC

    # ===== INSTALLATION =====
    installation/
      useCases/
        install.useCase.ts                  # → install.command
        uninstall.useCase.ts                # → uninstall.command
        doctor.useCase.ts                   # → doctor.command
      services/
        install.service.ts
        doctor.service.ts
      repositories/
        bunPath.repository.ts
        manifest.repository.ts
        settings.repository.ts
        shim.repository.ts
        skills.repository.ts
        seed.repository.ts
        jsonFile.repository.ts
      formatters/
        doctor.formatter.ts                 # CLI: doctor output
      resolvers/
        commands/
          install.command.ts
          uninstall.command.ts
          doctor.command.ts

    # ===== META — pure utility commands (no domain logic) =====
    meta/
      resolvers/
        commands/
          help.command.ts                   # No use case — pure formatting
          version.command.ts                # No use case — reads a constant

  main.ts                                   # Composition root: build context, register commands/hooks, run
```

---

## Hook Placement

| Hook | Event | Rationale | Module |
|------|-------|-----------|--------|
| `sessionStart` | SessionStart | Cross-cutting: reindexes notes + worklog, builds KB map | `memory/` |
| `injectMemory` | UserPromptSubmit | Cross-cutting: fused search across notes + worklog | `memory/` |
| `wrapGate` | Stop | Worklog-adjacent: tracks uncommitted work, wrap-state.json | `worklog/` |
| `compactCheckpoint` | PostCompact | Writes compact summary to worklog journal | `worklog/` |
| `worklogFloor` | SessionEnd | Writes git skeleton to worklog journal | `worklog/` |

---

## What Became Services (No Resolver)

| Was (use case) | Now (service method) | Lives in | Consumed by |
|----------------|----------------------|----------|-------------|
| `ReprojectNotesUseCase` | `noteService.incrementalReindex()` / `noteService.fullReindex()` | `note/services/` | `sessionStart` UC, `reindexMemory` UC |
| `SearchNotesUseCase` | `noteService.search()` | `note/services/` | `searchMemory` UC, `injectMemory` UC (via `memoryService.fusedSearch()`) |
| `BuildKbMapUseCase` | `kbMapService.build()` | `kb/services/` | `sessionStart` UC |
| `ReprojectWorklogUseCase` | `worklogService.reindex()` | `worklog/services/` | `sessionStart` UC, `reindexMemory` UC |
| `SearchWorklogUseCase` | `worklogService.search()` | `worklog/services/` | `searchMemory` UC, `injectMemory` UC (via `memoryService.fusedSearch()`) |
| `ResolveTargetWorkspacesUseCase` | `workspaceResolverService.resolveTarget()` | `workspace/services/` | `reindexMemory` UC |

---

## What `session/` Becomes (Gone)

Its contents distribute to:

| Was in `session/` | Goes to |
|-------------------|---------|
| `runtime/hookRuntime.service.ts` | `core/transport/hook/hook.runtime.ts` |
| `runtime/hookResult.serializer.ts` | `core/transport/hook/hookResult.serializer.ts` |
| `runtime/runtime.typedefs.ts` | `core/transport/hook/hook.typedefs.ts` |
| `payload/payload.parser.ts` | `core/transport/hook/payload.parser.ts` |
| `payload/payload.typedefs.ts` | `core/transport/hook/payload.typedefs.ts` |
| `session.typedefs.ts` (HookName, HookEvent, HookResultKind) | `core/transport/hook/hook.typedefs.ts` |
| `session.runner.ts` | `core/transport/hook/hook.runtime.ts` |
| Hook handlers | Split to `memory/resolvers/hooks/` and `worklog/resolvers/hooks/` |
| Hook formatters | Split to `memory/formatters/` and `worklog/formatters/` |
| `hookDispatch.command.ts` | Replaced by `@Hook` decorator + `registerHooks` in `main.ts` |

---

## Resolver → Use Case → Service Call Graph (with DI pattern)

```typescript
// memory/resolvers/commands/searchMemory.command.ts
@Command({
  path: ['search'],
  Handler: SearchMemoryUseCase,
  mapOptions: (argv, ctx) => ({ query: argv[0], cwd: ctx.cwd }),
  PostProcessing: SearchHitFormatter,
})
export class SearchMemoryCommand {}

// memory/useCases/searchMemory.useCase.ts
export class SearchMemoryUseCase extends UseCase<SearchInput, SearchOutput> {
  private readonly memoryService = this.makeService(MemoryService);

  async execute(input: SearchInput): Promise<SearchOutput> {
    const workspace = this.gateways.workspaceResolver.resolve(input.cwd);
    return await this.memoryService.fusedSearch(workspace, input.query);
  }
}

// memory/services/memory.service.ts
export class MemoryService extends Service {
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly ranker = new Ranker(); // pure, no gateway needed

  async fusedSearch(workspace: Workspace, query: string): Promise<FusedHit[]> {
    const noteHits = await this.noteService.search(workspace, query);
    const worklogHits = await this.worklogService.search(workspace, query);
    return this.ranker.fuse(noteHits, worklogHits);
  }
}
```

### SessionStart (hook — cross-cutting)

```typescript
// memory/useCases/sessionStart.useCase.ts
export class SessionStartUseCase extends UseCase<SessionStartInput, SessionStartOutput> {
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly worklogStore = this.makeService(WorklogStoreService);
  private readonly kbMapService = this.makeService(KbMapService); // from kb/ module

  async execute(input: SessionStartInput): Promise<SessionStartOutput> {
    await this.noteService.incrementalReindex(input.workspace);
    await this.worklogService.reindex(input.workspace);
    const kbMap = await this.kbMapService.build(input.workspace);
    const state = await this.worklogStore.readState(input.workspace, input.slug);
    return { workspaceId: input.workspace.id, slug: input.slug, kbMap, state };
  }
}
```

### WrapGate (hook — worklog module)

```typescript
// worklog/useCases/wrapGate.useCase.ts
export class WrapGateUseCase extends UseCase<WrapGateInput, WrapGateOutput> {
  private readonly wrapStateRepo = this.makeRepository(WrapStateRepository);
  private readonly worklogStore = this.makeService(WorklogStoreService);
  private readonly formatter = this.makeFormatter(WrapGateFormatter);

  async execute(input: WrapGateInput): Promise<WrapGateOutput> {
    const dirtyCount = await this.gateways.git.statusPorcelain(input.cwd);
    // ... business logic using this.gateways.git, this.gateways.clock, etc.
  }
}
```

### Full Call Graph

```
memory/commands/searchMemory  →  SearchMemoryUseCase
  → MemoryService.fusedSearch()
    → NoteService.search()
    → WorklogService.search()

memory/commands/reindexMemory →  ReindexMemoryUseCase
  → NoteService.fullReindex()
  → WorklogService.reindex()

memory/hooks/sessionStart     →  SessionStartUseCase
  → NoteService.incrementalReindex()
  → WorklogService.reindex()
  → KbMapService.build()           (from kb/ module)
  → WorklogStoreService.readState()
  → KbMapFormatter                 (from kb/ module, cross-module OK)
  → WorkingMemoryFormatter         (from worklog/ module, cross-module OK)

memory/hooks/injectMemory     →  InjectMemoryUseCase
  → MemoryService.fusedSearch()
    → NoteService.search()
    → WorklogService.search()
  → InjectLogRepository.append()

worklog/commands/commit       →  CommitWorklogUseCase
  → this.gateways.git (commit, add)

worklog/hooks/wrapGate        →  WrapGateUseCase
  → WrapStateRepository (read/write wrap-state.json)
  → this.gateways.git (statusPorcelain, revParse, showToplevel)
  → this.gateways.clock
  → WorklogStoreService.statePath()

worklog/hooks/compactCheckpoint → AppendCompactUseCase
  → CompactCheckpointFormatter (domain: block text for journal)
  → WorklogStoreService.appendToDated()

worklog/hooks/worklogFloor    →  WriteStateFloorUseCase
  → this.gateways.git (branch, diffStat, logOneline)
  → WorklogFloorFormatter (domain: block text for journal)
  → WorklogStoreService.appendToDated()
```

---

## What's Gone

| Removed | Reason |
|---------|--------|
| `src/cli/` directory | Transport → `core/transport/cli/`, commands → modules |
| `src/modules/session/` | Distributed to `core/transport/hook/`, `memory/`, `worklog/` |
| `src/cli/cli.wiring.ts` | Replaced by decorator-based registration in `main.ts` |
| Old `HookDispatchCommand` (in session/) | Replaced by `@Hook` decorator + `registerHooks` |
| Use cases without resolvers | Become service methods |
| `makeCommand` / `makeHook` factory functions | Replaced by `@Command` / `@Hook` decorators |

---

## Migration Strategy

### Phase 1: Add base classes and decorators

- Create `core/base/` with `UseCase`, `Service`, `Repository`, `Projection` base classes
- Create `core/decorators/` with `@Command` and `@Hook` decorators
- Create `modules/registry.ts` to list all commands and hooks

### Phase 2: Extract CLI transport to `core/transport/cli/`

- Move `cli.runner.ts`, typedefs, utils
- Commands stay in place for now

### Phase 3: Extract hook transport to `core/transport/hook/`

- Move `hook.runtime.ts`, `hook.typedefs.ts`, `hookResult.serializer.ts`
- Move `payload.parser.ts`, `payload.typedefs.ts`

### Phase 4: Promote use cases without resolvers to services

- `ReprojectNotesUseCase` → `noteService.incrementalReindex()` / `fullReindex()`
- `SearchNotesUseCase` → `noteService.search()`
- `BuildKbMapUseCase` → `kbMapService.build()` (in new `kb/` module)
- `ReprojectWorklogUseCase` → `worklogService.reindex()`
- `SearchWorklogUseCase` → `worklogService.search()`
- `ResolveTargetWorkspacesUseCase` → `workspaceResolverService.resolveTarget()`

### Phase 5: Move CLI commands into their domain modules

- `search` → `memory/resolvers/commands/searchMemory.command.ts`
- `reindex` → `memory/resolvers/commands/reindexMemory.command.ts`
- `help`, `version` → `meta/resolvers/commands/`
- Convert each command to use `@Command` decorator

### Phase 6: Split hooks to domain modules

- `sessionStart`, `injectMemory` → `memory/resolvers/hooks/`
- `wrapGate`, `compactCheckpoint`, `worklogFloor` → `worklog/resolvers/hooks/`
- Convert each hook to use `@Hook` decorator
- Remove `session/` module entirely

### Phase 7: Create explicit registry

- List all decorated commands in `modules/registry.ts`
- List all decorated hooks in `modules/registry.ts`
- Update `main.ts` to use `registerCommands` and `registerHooks`
