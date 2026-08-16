# Phase 2: CLI Transport Extraction

## Dependencies

- Phase 1 (base classes)

## Can Parallel With

- Phase 3 (Hook transport) — different files, no overlap

## Objective

Move the CLI transport shell and its arg-parse helpers out of `src/cli/` and
`src/core/entry/` into `src/core/transport/cli/`. No behavior change; the runner's
public shape changes only in that it takes `AppContext` instead of a `{home,cwd,
config}` context.

## Reality check (what actually exists)

- `src/cli/cli.runner.ts` — `matchCommand` + `runCli` (the transport shell).
- `src/core/entry/entry.utils.ts` — `cliFailure`, `cliOutcome`, `registerCommand`,
  `hasFlag`, `flagValue`, `variadicValues`, `intFlag`, `requirePositional`.
- `src/core/entry/entry.constants.ts` — `DEFAULT_FAILURE_EXIT_CODE`,
  `ARGS_PARSE_ERROR_EXIT_CODE`, `CLI_SUCCESS`.
- `src/core/entry/entry.typedefs.ts` — `RunContext`, `CommandResult`, `CliOutcome`,
  `CommandDescriptor`, `ArgsError`, `EnvVarDescriptor`, `Command`,
  `RegisteredCommand`, `CommandClass` (plus `HookDescriptor` — see Phase 3/4).

There is **no** `src/cli/cli.typedefs.ts` or `src/cli/cli.utils.ts` today; the plan's
"if exists" files are the `entry.*` files above.

## Files to Create

### `src/core/transport/cli/cli.runner.ts`

Move from `src/cli/cli.runner.ts`. Change `runCli`'s third parameter from
`RunContext` to `AppContext` and read `home`/`cwd` from `ctx.gateways.env`:

```typescript
export async function runCli(
  argv: readonly string[],
  commands: readonly RegisteredCommand[],
  ctx: AppContext,
): Promise<CommandResult> {
  const context: RunContext = {
    home: ctx.gateways.env.home(),
    cwd: ctx.gateways.env.cwd(),
    config: ctx.config,
  };
  // ... unchanged matching/parsing/run logic
}
```

`matchCommand` and the help/version `-h`/`--help`/`-V`/`--version` routing are
unchanged.

### `src/core/transport/cli/cli.utils.ts`

Move `src/core/entry/entry.utils.ts` verbatim. `registerCommand` stays here until
Phase 4 replaces it with the decorator-driven `registerCommands`; keep it exported
so Phase 2–3 stay green.

### `src/core/transport/cli/cli.constants.ts`

Move `src/core/entry/entry.constants.ts` verbatim.

### `src/core/transport/cli/cli.typedefs.ts`

Move the CLI-side types from `src/core/entry/entry.typedefs.ts`: `RunContext`,
`CommandResult`, `CliOutcome`, `ArgsError`, `EnvVarDescriptor`. `CommandDescriptor`
and `HookDescriptor` move to the decorators in Phase 4 (leave them re-exported here
for now so imports keep resolving).

Re-export all four through `src/core/index.ts` (no `cli/index.ts`).

## Implementation Steps

1. Create `src/core/transport/cli/` with the four files above.
2. Update `src/cli/main.ts` and `src/cli/cli.wiring.ts` to import from
   `@/core/index.ts` (they already import the runner/helpers from `@/core/index.ts`,
   so mostly the `entry.*` → `transport/cli/*` source moves are internal to `core`).
3. Update `src/cli/cli.runner.ts`-importing tests to the new path.
4. Keep `src/cli/cli.runner.ts` **not yet deleted** (it is re-exported/removed in
   Phase 8) — delete or replace it only when nothing imports it.

## Affected Files

- `src/cli/main.ts`, `src/cli/cli.wiring.ts`
- `src/cli/cli.e2e.test.ts`, `src/cli/main.test.ts`
- Any module command importing `@/core/index.ts` (no change — they keep importing
  the barrel)

## Acceptance Criteria

- [ ] `src/core/transport/cli/` holds runner, typedefs, utils, constants
- [ ] `runCli` takes `AppContext`; matching/help/version routing unchanged
- [ ] No test changes its assertions (behavior is identical)
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 4 (decorators). Phase 3 runs in parallel.
