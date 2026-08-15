import { CLI_SUCCESS, ConfigParser, cliOutcome } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { AppGateways } from "@/gateways/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { KbMapFormatter, KbMapService, NoteParser } from "@/knowledge/index.ts";
import type { HookArgs } from "@/modules/session/commands/hookDispatch/hookDispatch.typedefs.ts";
import { CompactCheckpointFormatter } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import { CompactCheckpointHook } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.hook.ts";
import { MemoryInjectFormatter } from "@/modules/session/hooks/memoryInject/memoryInject.formatter.ts";
import { MemoryInjectHook } from "@/modules/session/hooks/memoryInject/memoryInject.hook.ts";
import { SessionStartHook } from "@/modules/session/hooks/sessionStart/sessionStart.hook.ts";
import { WorklogFloorHook } from "@/modules/session/hooks/worklogFloor/worklogFloor.hook.ts";
import { WrapGateFormatter } from "@/modules/session/hooks/wrapGate/wrapGate.formatter.ts";
import { WrapGateHook } from "@/modules/session/hooks/wrapGate/wrapGate.hook.ts";
import { PayloadParser } from "@/modules/session/payload/payload.parser.ts";
import { HookResultSerializer } from "@/modules/session/runtime/hookResult.serializer.ts";
import { HookRuntimeService } from "@/modules/session/runtime/runtime.service.ts";
import { HookName } from "@/modules/session/session.typedefs.ts";
import {
  WorkingMemoryFormatter,
  WorklogFloorFormatter,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import {
  FtsQueryBuilder,
  IndexBuildService,
  IndexConnectionService,
  LinkGraphService,
  Ranker,
  SchemaService,
  SearchService,
  TokenizerParser,
} from "@/retrieval/index.ts";

/** Exported so a test can pin it against the installer's registration table. */
export const dispatchableHookNames: readonly HookName[] = Object.values(HookName);

/** Every hook's real composition root: no hook constructs its own dependencies,
 * each is wired here from the real `Gateways` handed to `execute`. */
function makeIndexConnectionService(): IndexConnectionService {
  return new IndexConnectionService(new SchemaService());
}

function makeIndexBuildService(): IndexBuildService {
  return new IndexBuildService(makeIndexConnectionService());
}

function makeSearchService(): SearchService {
  const connectionService = makeIndexConnectionService();
  return new SearchService(
    connectionService,
    new FtsQueryBuilder(new TokenizerParser()),
    new Ranker(),
    new LinkGraphService(connectionService),
  );
}

function makeWorklogStoreService(container: Gateways): WorklogStoreService {
  return new WorklogStoreService(container.fs, container.git);
}

/** An unknown `name` stays fail-open: this same CLI path is what `settings.json`
 * invokes as a real hook, so a typo'd name must never turn into a non-zero exit
 * that breaks a session. */
export class HookDispatchCommand {
  constructor(
    private readonly container: Gateways,
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
          new SessionStartHook(
            this.container,
            makeIndexBuildService(),
            new KbMapService(this.container.fs, new NoteParser()),
            new KbMapFormatter(),
            makeWorklogStoreService(this.container),
            new WorkingMemoryFormatter(),
          ),
        );
        break;
      case HookName.MemoryInject:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseMemoryInject(record),
          new MemoryInjectHook(
            this.container,
            this.config,
            new MemoryInjectFormatter(),
            makeSearchService(),
            new TokenizerParser(),
          ),
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
            makeWorklogStoreService(this.container),
          ),
        );
        break;
      case HookName.WorklogFloor:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseWorklogFloor(record),
          new WorklogFloorHook(
            this.container,
            new WorklogFloorFormatter(),
            makeWorklogStoreService(this.container),
          ),
        );
        break;
      case HookName.CompactCheckpoint:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseCompactCheckpoint(record),
          new CompactCheckpointHook(
            this.container,
            new CompactCheckpointFormatter(),
            makeWorklogStoreService(this.container),
          ),
        );
        break;
    }
    return CLI_SUCCESS;
  }
}

/** Unlike every other command, this one is never handed a `Gateways`/`Config`
 * by `main.ts`, so it builds the real ones itself. */
export async function hook(args: HookArgs): Promise<CliOutcome> {
  const container = new AppGateways(process.env);
  const config = new ConfigParser().parse(process.env);
  return new HookDispatchCommand(container, config).execute(args);
}
