import { makeRealContainer } from "../../container.ts";
import type { Container } from "../../container.ts";
import { parseConfig } from "../../domain/Config.ts";
import type { Config } from "../../domain/Config.ts";
import { HookName } from "../../domain/HookName.ts";
import { handleCompactCheckpoint } from "../../hooks/compactCheckpoint.hook.ts";
import { handleMemoryInject } from "../../hooks/memoryInject.hook.ts";
import {
  parseCompactCheckpointPayload,
  parseMemoryInjectPayload,
  parseSessionStartPayload,
  parseWorklogFloorPayload,
  parseWrapGatePayload,
} from "../../hooks/payload.ts";
import { runHook } from "../../hooks/runtime.ts";
import { handleSessionStart } from "../../hooks/sessionStart.hook.ts";
import { handleWorklogFloor } from "../../hooks/worklogFloor.hook.ts";
import { handleWrapGate } from "../../hooks/wrapGate.hook.ts";
import type { HookArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome, cliOutcome } from "../CliOutcome.ts";

/**
 * `memory hook <name>` — one of C3's two additive subcommands
 * ([[contracts]]), dispatching to the 5 real handlers (`src/hooks/*.hook.ts`).
 * The CLI names below (`session-start`, `memory-inject`, `wrap-gate`,
 * `worklog-floor`, `compact-checkpoint`) are what P9's installer registers as
 * each hook's command in `settings.json`
 * (`<abs-bun> <repo>/dist/memory.js hook <name>`) — new strings with no
 * Python precedent (`tools/install.py`'s own `HOOKS` map keys events to
 * `.py` filenames, not CLI names), chosen to match those filenames minus the
 * extension.
 */

/** Every name `parseHookName` accepts — exported so a test can pin it against the
 * installer's registration table (see hookNameAgreement.test.ts). */
export const dispatchableHookNames: readonly HookName[] = Object.values(HookName);

function parseHookName(raw: string): HookName | null {
  switch (raw) {
    case HookName.SessionStart:
      return HookName.SessionStart;
    case HookName.MemoryInject:
      return HookName.MemoryInject;
    case HookName.WrapGate:
      return HookName.WrapGate;
    case HookName.WorklogFloor:
      return HookName.WorklogFloor;
    case HookName.CompactCheckpoint:
      return HookName.CompactCheckpoint;
    default:
      return null;
  }
}

/**
 * The container-injected core of `hook()`, split out so it's testable
 * in-process with `tests/helpers/container.ts`'s fakes — `hook()` itself
 * (below) is the one place that supplies a REAL container, and is exercised
 * as a black box by `tests/contract/failopen.test.ts`'s spawn tests instead.
 *
 * An unknown `name` stays fail-open exactly like the rest of this
 * subcommand — invariant #3 applies here too, since this same CLI path is
 * what `settings.json` invokes as a real hook: a typo'd hook name must never
 * turn into a non-zero exit that breaks a session.
 */
export async function dispatchHook(
  container: Container,
  config: Config,
  args: HookArgs,
): Promise<CliOutcome> {
  const name = parseHookName(args.name);
  if (name === null) {
    return cliOutcome(0, `memory hook '${args.name}': unknown hook name`);
  }

  switch (name) {
    case HookName.SessionStart:
      await runHook(
        container,
        config,
        name,
        parseSessionStartPayload,
        handleSessionStart,
      );
      break;
    case HookName.MemoryInject:
      await runHook(
        container,
        config,
        name,
        parseMemoryInjectPayload,
        handleMemoryInject,
      );
      break;
    case HookName.WrapGate:
      await runHook(container, config, name, parseWrapGatePayload, handleWrapGate);
      break;
    case HookName.WorklogFloor:
      await runHook(
        container,
        config,
        name,
        parseWorklogFloorPayload,
        handleWorklogFloor,
      );
      break;
    case HookName.CompactCheckpoint:
      await runHook(
        container,
        config,
        name,
        parseCompactCheckpointPayload,
        handleCompactCheckpoint,
      );
      break;
  }
  return CLI_SUCCESS;
}

/**
 * The real entrypoint `main.ts`'s dispatch calls (`case CliCommand.Hook:
 * return hook(parsed);`, `cli/main.ts`) — unlike every other command, this
 * one is never handed a `Container`/`Config` by `main.ts`, so it builds the
 * real ones itself, the same way `main.ts`'s own `import.meta.main` guard
 * does for every other command.
 */
export async function hook(args: HookArgs): Promise<CliOutcome> {
  const container = makeRealContainer(process.env);
  const config = parseConfig(process.env);
  return dispatchHook(container, config, args);
}

// Re-exported so existing importers (and the hook tests) keep one import site.
export { HookName };
