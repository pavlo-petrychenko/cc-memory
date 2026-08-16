# Phase 8: Registry + main.ts (entry move)

## Dependencies

- Phase 6, Phase 7

## Can Parallel With

- None

## Objective

Replace `cli/cli.wiring.ts` + `cli/main.ts` with an explicit `modules/registry.ts`
and a clean entry point. Highest-risk phase: it changes the process entry, the
build script, and the installed shim together, and it must preserve fail-open hook
dispatch (invariant #3, contract C2).

## 1. Create `src/modules/registry.ts`

An explicit list of every command class and hook class:

```typescript
import { SearchMemoryCommand } from "@/modules/memory/resolvers/commands/searchMemory.command.ts";
// ... 13 command classes
export const commands = [ SearchMemoryCommand, ReindexMemoryCommand, NotesCommand,
  CommitCommand, WorkspaceAddCommand, WorkspaceRmCommand, WorkspaceLsCommand,
  ResolveCommand, InstallCommand, UninstallCommand, DoctorCommand, HelpCommand,
  VersionCommand ];

import { SessionStartHook } from "@/modules/memory/resolvers/hooks/sessionStart.hook.ts";
// ...
export const hooks = [ SessionStartHook, InjectMemoryHook, WrapGateHook,
  WorklogFloorHook, CompactCheckpointHook ];
```

Cross-module imports resolve through each module's `index.ts` (or end in
`.typedefs.ts`/`.constants.ts`) — `moduleBoundaries.test.ts`.

## 2. Rewrite `main.ts` (moved to `src/main.ts`)

```typescript
#!/usr/bin/env bun
import { AppGateways } from "@/gateways/index.ts";
import { ConfigParser, type AppContext } from "@/core/index.ts";
import { runCli, registerCommands, registerHooks } from "@/core/index.ts";
import { runHookDispatch } from "@/core/transport/hook/hook.runtime.ts";
import { commands, hooks } from "@/modules/registry.ts";

if (import.meta.main) {
  const env = process.env;
  const ctx: AppContext = { gateways: new AppGateways(env), config: new ConfigParser().parse(env) };
  const argv = process.argv.slice(2);

  if (argv[0] === "hook") {
    // Fail-open: runHookDispatch never throws and never returns non-zero —
    // the runtime's finally { stdio.exit(0) } is the only exit on this path.
    await runHookDispatch(argv[1] ?? "", registerHooks(hooks, ctx), ctx);
  } else {
    const handlers = registerCommands(commands, ctx);
    const result = await runCli(argv, handlers, ctx);
    for (const line of result.lines) ctx.gateways.stdio.write(line);
    if (result.stderrMessage !== null) process.stderr.write(`${result.stderrMessage}\n`);
    ctx.gateways.stdio.exit(result.exitCode);
  }
}
```

`runHookDispatch(name, handlers, ctx)` lives in `hook.runtime.ts` beside
`HookRuntimeService`. For an unknown name it **logs** and calls `stdio.exit(0)` —
never `process.exit(1)`, never `process.exit(result.exitCode)` (the correction of
the original Phase 8's fail-open violation).

## 3. Entry + install surface (C6) — update together

- `package.json#build`: `bun build src/main.ts --target=bun --outfile dist/memory.js`.
- `src/modules/installation/steps/shim/shim.repository.ts`: shim still executes the
  built `dist/memory.js` — verify the entry assumption (no path change to
  `~/.local/bin/memory`, only the build input).
- `src/testing/utils/buildDist.utils.ts` + `runCli.utils.ts`: spawn `dist/memory.js`
  (unchanged path) — confirm nothing references `src/cli/main.ts`.

## 4. Required quality-gate migrations

- `fileKinds.test.ts`: add `registry.ts` to `ALLOWED_EXACT_NAMES`; add `modules` to
  `NO_BARREL_ROOTS`.
- `docs.test.ts`: exclude `main.ts` and `modules/registry.ts` from the module-root
  rule (like the existing `version.ts` exclusion).
- `purity.test.ts`: `COMPOSITION_ROOTS` → `new Set(["main.ts", "modules/registry.ts"])`.
- `registries.test.ts`: import from `@/modules/registry.ts`; assert `--help` equals
  the visible `registerCommands(commands, ctx)` surface; keep the
  "every `.command.ts` carries `@Command(`" / "every `.hook.ts` carries `@Hook(`"
  assertions.

## 5. Delete superseded trees

- `src/cli/` (runner→`core/transport/cli/` in Phase 2; wiring→`registry.ts`; commands→
  Phase 6; `main.ts`→`src/main.ts`). Delete the directory including `src/cli/CLAUDE.md`.
- `src/core/entry/` (decorators→`core/decorators/`; typedefs/utils/constants→
  `core/transport/cli/`). Grep for `@/core/entry/` — zero importers.

## 6. Update `CLAUDE.md` (stale architecture section)

Rewrite the "Architecture" section to the real tree: `core/` (base, decorators,
transport, config, search, utils), `gateways/`, `modules/` (workspace, note,
worklog, kb, memory, installation, meta + `registry.ts`), `quality/`, `testing/`,
`skills/`, `main.ts`, `version.ts`. Do **not** touch the invariants, frozen
contracts, or traps sections.

## Tests

- `src/main.test.ts` (moved from `cli/main.test.ts`) — parse failure → exit 2,
  unknown command → exit 2, `--help` lists the surface.
- `cli.e2e.test.ts` → `src/main.e2e.test.ts` — spawns `dist/memory.js`, validating
  the entry move end-to-end.
- Hook dispatch tests move to `core/transport/hook/`.

## Acceptance Criteria

- [ ] `src/modules/registry.ts` lists all 13 commands + 5 hooks
- [ ] `src/main.ts` builds; `bun build src/main.ts` emits `dist/memory.js`
- [ ] `memory hook not-a-real-hook` exits 0 (fail-open), empty stdout, logged
- [ ] `memory hook session-start` works against the built artifact
- [ ] All `golden/cli/*` outputs byte-identical
- [ ] `grep -r "core/entry\|modules/session\|cli/commands\|cli.wiring" src/` is empty
- [ ] `bun run check` passes from a clean `dist/`

## Final State

- ✅ Base classes with DI (`core/base/`)
- ✅ `@Command`/`@Hook` decorators (`core/decorators/`)
- ✅ CLI transport (`core/transport/cli/`) and hook transport (`core/transport/hook/`)
- ✅ Commands in `resolvers/commands/`, hooks in `resolvers/hooks/`, all thin
- ✅ Use cases 1:1 with resolvers, in the same module; orphan logic in services
- ✅ Explicit registry (`modules/registry.ts`)
- ✅ Clean `main.ts`; no `cli/`, no `session/`, no `core/entry/`
- ✅ `CLAUDE.md` architecture section matches the tree
