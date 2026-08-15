import { CLI_SUCCESS, ConfigParser, cliOutcome } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { AppGateways, SearchIndexAdapter } from "@/gateways/index.ts";
import type { Gateways, SearchIndex } from "@/gateways/index.ts";
import {
  BuildKbMapUseCase,
  KbMapFormatter,
  KbMapService,
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  ReprojectNotesUseCase,
  SearchNotesUseCase,
} from "@/modules/note/index.ts";
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
  ReprojectWorklogUseCase,
  SearchWorklogUseCase,
  WorklogProjection,
  WorklogQuery,
} from "@/modules/worklog/index.ts";

/** Exported so a test can pin it against the installer's registration table. */
export const dispatchableHookNames: readonly HookName[] = Object.values(HookName);

/** Every hook's real composition root: no hook constructs its own dependencies,
 * each is wired here from the real `Gateways` handed to `execute`. */
function makeSearchIndex(container: Gateways): SearchIndex {
  return new SearchIndexAdapter(container.fs, (path) => container.openDatabase(path));
}

function makeNoteModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const repository = new NoteRepository(container.fs, new NoteParser());
  const projection = new NoteProjection(index);
  const query = new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    reprojectNotes: new ReprojectNotesUseCase(repository, projection),
    searchNotes: new SearchNotesUseCase(query),
    buildKbMap: new BuildKbMapUseCase(new KbMapService(container.fs, new NoteParser())),
    kbMapFormatter: new KbMapFormatter(),
  };
}

function makeWorklogModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const store = new WorklogStoreService(container.fs, container.git);
  const projection = new WorklogProjection(index);
  const query = new WorklogQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    store,
    reprojectWorklog: new ReprojectWorklogUseCase(store, projection),
    searchWorklog: new SearchWorklogUseCase(query),
  };
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
    const index = makeSearchIndex(this.container);
    const note = makeNoteModule(this.container, index);
    const worklog = makeWorklogModule(this.container, index);

    switch (name) {
      case HookName.SessionStart:
        await hookRuntimeService.run(
          name,
          (record) => payloadParser.parseSessionStart(record),
          new SessionStartHook(
            this.container,
            note.reprojectNotes,
            worklog.reprojectWorklog,
            note.buildKbMap,
            note.kbMapFormatter,
            worklog.store,
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
            note.searchNotes,
            worklog.searchWorklog,
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
            worklog.store,
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
            worklog.store,
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
            worklog.store,
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
