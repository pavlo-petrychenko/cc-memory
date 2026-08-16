# Phase 4: @Command / @Hook Decorator API

## Dependencies

- Phase 1 (base classes)

## Can Parallel With

- Phases 2–3 (they only move transport files; this only adds files)

## Objective

Add the **new** `@Command`/`@Hook` decorator API in `src/core/decorators/`. This is
the plan's replacement for the existing `@Command(CommandDescriptor)` /
`@Hook(HookDescriptor)` in `src/core/entry/` (which stays in place until Phase 8).

The new API differs from the original plan in two ways, both required to keep the
frozen CLI/hook contracts working:

1. `CommandParams` keeps the descriptor metadata (`usage`, `summary`, `hidden`)
   that `--help` renders and `registries.test.ts` asserts against.
2. `mapOptions` returns `Result<Options, ArgsError>` so argument-parse failures
   still map to exit code 2 (pinned by `src/cli/main.test.ts`).

`HookParams` keeps `event` and `timeoutSeconds` because the installer writes them
into `settings.json`.

## Files to Create

### `src/core/decorators/command.decorator.ts`

```typescript
import type {
  ArgsError,
  FormatterConstructor,
  UseCaseConstructor,
} from "@/core/index.ts";
import type { AppContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";

export const COMMAND_METADATA = Symbol("command");

export interface CommandParams<Options, Result> {
  path: readonly string[];
  usage: readonly string[];   // rendered by --help (was CommandDescriptor.usage)
  summary: string;            // rendered by --help
  hidden: boolean;            // hidden commands stay dispatchable but off --help
  Handler: UseCaseConstructor<Options, Result>;
  mapOptions: (tokens: readonly string[], ctx: AppContext) => Result<Options, ArgsError>;
  PostProcessing?: FormatterConstructor<Result>;
}

export function Command<Options, Result>(params: CommandParams<Options, Result>) {
  return function <T extends abstract new (...args: never[]) => object>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    Object.defineProperty(target, COMMAND_METADATA, { value: params });
    return target;
  };
}

export interface CommandHandler {
  path: readonly string[];
  usage: readonly string[];
  summary: string;
  hidden: boolean;
  invoke: (tokens: readonly string[], ctx: AppContext) => Promise<CommandResult>;
}

export function registerCommands(
  commandClasses: readonly CommandClass[],
  ctx: AppContext,
): CommandHandler[] {
  return commandClasses.map((CmdClass) => {
    const params = CmdClass[COMMAND_METADATA];
    if (params === undefined) throw new Error(`${CmdClass.name} has no @Command decorator`);
    return {
      path: params.path,
      usage: params.usage,
      summary: params.summary,
      hidden: params.hidden,
      invoke: async (tokens, ctx) => {
        const options = params.mapOptions(tokens, ctx);
        if (!options.ok) {
          return { lines: [], exitCode: ARGS_PARSE_ERROR_EXIT_CODE, stderrMessage: options.error.message };
        }
        const useCase = new params.Handler(ctx);
        const result = await useCase.execute(options.value);
        const formatted = params.PostProcessing
          ? new params.PostProcessing().format(result)
          : result;
        return { lines: toLines(formatted), exitCode: 0, stderrMessage: null };
      },
    };
  });
}
```

`toLines` normalizes a formatter result (`string | null | readonly string[]`) into
`lines`. The `help` and `version` commands still route via `-h`/`-V` (unchanged
`matchCommand` in Phase 2).

### `src/core/decorators/hook.decorator.ts`

```typescript
export interface HookParams<Options, Result> {
  name: HookName;
  event: HookEvent;         // installer writes settings.json "hook <event>"
  timeoutSeconds: number;   // installer writes timeout
  Handler: UseCaseConstructor<Options, Result>;
  mapOptions: (payload: JsonRecord, ctx: AppContext) => Options;
}

export function Hook<Options, Result>(params: HookParams<Options, Result>) { /* attach symbol */ }

export interface HookHandler {
  name: HookName;
  handle: (payload: JsonRecord, ctx: AppContext) => Promise<void>;  // fail-open internally
}

export function registerHooks(hookClasses, ctx): HookHandler[] { /* ... */ }
```

The hook `Handler`'s `execute` returns a `HookResult` (`silent`/`context`/`block`)
exactly as today, and the moved `HookRuntimeService` (Phase 3) still serializes it
with `HookResultSerializer` and always exits 0. `PostProcessing` is **not** on the
hook path — the formatters stay inside the hook use cases, and the serializer is
the only stdout writer. This preserves C2 verbatim.

### Re-export through `src/core/index.ts` (no `core/decorators/index.ts`)

```typescript
export { Command, registerCommands, type CommandParams, type CommandHandler } from "@/core/decorators/command.decorator.ts";
export { Hook, registerHooks, type HookParams, type HookHandler } from "@/core/decorators/hook.decorator.ts";
```

## Tests

- `src/core/decorators/command.decorator.test.ts` — a `TestUseCase extends UseCase`,
  a `@Command`-decorated class, `registerCommands`; assert parse-error path yields
  exit 2 + the `ArgsError` message, and success path runs `Handler` + `PostProcessing`.
- `src/core/decorators/hook.decorator.test.ts` — same shape; assert `name`/`event`/
  `timeoutSeconds` are stored on the symbol.

## Acceptance Criteria

- [ ] 2 decorator files + `core/index.ts` re-exports
- [ ] `CommandParams` carries `usage`/`summary`/`hidden`; `HookParams` carries
  `event`/`timeoutSeconds`
- [ ] `mapOptions` returns `Result<Options, ArgsError>` (exit-2 parse errors)
- [ ] No `core/decorators/index.ts`
- [ ] `bun test src/core/decorators/` passes
- [ ] `bun run check` passes (old `core/entry/` decorators still present and used)

## Next Phase

→ Phase 5 (convert commands + use cases; extract kb/; move search/reindex/help/version).
