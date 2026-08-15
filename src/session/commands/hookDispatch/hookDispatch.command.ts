import type { HookArgs } from "@/cli/index.ts";
import { CLI_SUCCESS, ConfigParser, cliOutcome } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { AppContainer } from "@/platform/index.ts";
import type { Container } from "@/platform/index.ts";
import {
  CompactCheckpointFormatter,
  CompactCheckpointHook,
} from "@/session/hooks/compactCheckpoint/index.ts";
import {
  MemoryInjectFormatter,
  MemoryInjectHook,
} from "@/session/hooks/memoryInject/index.ts";
import { SessionStartHook } from "@/session/hooks/sessionStart/index.ts";
import { WorklogFloorHook } from "@/session/hooks/worklogFloor/index.ts";
import { WrapGateFormatter, WrapGateHook } from "@/session/hooks/wrapGate/index.ts";
import { PayloadParser } from "@/session/payload/index.ts";
import { HookResultSerializer, HookRuntimeService } from "@/session/runtime/index.ts";
import { HookName } from "@/session/session.typedefs.ts";

/**
 * `memory hook <name>` — dispatches to the 5 real handlers, one per
 * `hooks/<name>/<name>.hook.ts`. The CLI names below (`session-start`,
 * `memory-inject`, `wrap-gate`, `worklog-floor`, `compact-checkpoint`) are
 * what the installer registers as each hook's command in `settings.json`
 * (`<abs-bun> <repo>/dist/memory.js hook <name>`).
 */

/** Every name `HookDispatchCommand` accepts — exported so a test can pin it
 * against the installer's registration table (see hookNameAgreement.test.ts). */
export const dispatchableHookNames: readonly HookName[] = Object.values(HookName);

/**
 * The container-injected core of `memory hook <name>`, constructed with a
 * real `Container`/`Config` by `hook()` (below) — the one place that
 * supplies REAL ones for an actual invocation. Constructor injection is what
 * makes `execute` testable in-process with fakes instead.
 *
 * An unknown `name` stays fail-open exactly like the rest of this
 * subcommand: this same CLI path is what `settings.json` invokes as a real
 * hook, so a typo'd hook name must never turn into a non-zero exit that
 * breaks a session.
 */
export class HookDispatchCommand {
  constructor(
    private readonly container: Container,
    private readonly config: Config,
  ) {}

  private parseHookName(raw: string): HookName | null {
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

  async execute(args: HookArgs): Promise<CliOutcome> {
    const name = this.parseHookName(args.name);
    if (name === null) {
      return cliOutcome(0, `memory hook '${args.name}': unknown hook name`);
    }

    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      this.container,
      payloadParser,
      new HookResultSerializer(),
    );

    switch (name) {
      case HookName.SessionStart:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseSessionStart(record),
          new SessionStartHook(this.container),
        );
        break;
      case HookName.MemoryInject:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseMemoryInject(record),
          new MemoryInjectHook(this.container, this.config, new MemoryInjectFormatter()),
        );
        break;
      case HookName.WrapGate:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseWrapGate(record),
          new WrapGateHook(
            this.container,
            this.config,
            payloadParser,
            new WrapGateFormatter(),
          ),
        );
        break;
      case HookName.WorklogFloor:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseWorklogFloor(record),
          new WorklogFloorHook(this.container),
        );
        break;
      case HookName.CompactCheckpoint:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseCompactCheckpoint(record),
          new CompactCheckpointHook(this.container, new CompactCheckpointFormatter()),
        );
        break;
    }
    return CLI_SUCCESS;
  }
}

/**
 * The real entrypoint `main.ts`'s dispatch calls — unlike every other
 * command, this one is never handed a `Container`/`Config` by `main.ts`, so
 * it builds the real ones itself.
 */
export async function hook(args: HookArgs): Promise<CliOutcome> {
  const container = new AppContainer(process.env);
  const config = new ConfigParser().parse(process.env);
  return new HookDispatchCommand(container, config).execute(args);
}
