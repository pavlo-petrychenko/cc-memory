import type { HookArgs } from "@/cli/index.ts";
import { type CliOutcome } from "@/cli/index.ts";
import { CLI_SUCCESS, cliOutcome } from "@/core/index.ts";
import { parseConfig } from "@/core/index.ts";
import type { Config } from "@/core/index.ts";
import { makeRealContainer } from "@/platform/index.ts";
import type { Container } from "@/platform/index.ts";
import { handleCompactCheckpoint } from "@/session/hooks/compactCheckpoint/index.ts";
import { handleMemoryInject } from "@/session/hooks/memoryInject/index.ts";
import { handleSessionStart } from "@/session/hooks/sessionStart/index.ts";
import { handleWorklogFloor } from "@/session/hooks/worklogFloor/index.ts";
import { handleWrapGate } from "@/session/hooks/wrapGate/index.ts";
import {
  parseCompactCheckpointPayload,
  parseMemoryInjectPayload,
  parseSessionStartPayload,
  parseWorklogFloorPayload,
  parseWrapGatePayload,
} from "@/session/payload/index.ts";
import { runHook } from "@/session/runtime/index.ts";
import { HookName } from "@/session/session.typedefs.ts";

/**
 * `memory hook <name>` — dispatches to the 5 real handlers, one per
 * `hooks/<name>/<name>.hook.ts`. The CLI names below (`session-start`,
 * `memory-inject`, `wrap-gate`, `worklog-floor`, `compact-checkpoint`) are
 * what the installer registers as each hook's command in `settings.json`
 * (`<abs-bun> <repo>/dist/memory.js hook <name>`).
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
 * in-process with fakes — `hook()` itself (below) is the one place that
 * supplies a REAL container.
 *
 * An unknown `name` stays fail-open exactly like the rest of this
 * subcommand: this same CLI path is what `settings.json` invokes as a real
 * hook, so a typo'd hook name must never turn into a non-zero exit that
 * breaks a session.
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
 * The real entrypoint `main.ts`'s dispatch calls — unlike every other
 * command, this one is never handed a `Container`/`Config` by `main.ts`, so
 * it builds the real ones itself.
 */
export async function hook(args: HookArgs): Promise<CliOutcome> {
  const container = makeRealContainer(process.env);
  const config = parseConfig(process.env);
  return dispatchHook(container, config, args);
}
