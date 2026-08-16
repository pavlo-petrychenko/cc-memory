import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import {
  CLI_SUCCESS,
  cliOutcome,
  Command,
  FtsQueryBuilder,
  HookResultSerializer,
  HookRuntimeService,
  PayloadParser,
  Ranker,
  TokenizerParser,
} from "@/core/index.ts";
import type {
  AbsPath,
  ArgsError,
  CliOutcome,
  CommandResult,
  Config,
  Result,
  RunContext,
  Workspace,
} from "@/core/index.ts";
import { HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { SearchIndexAdapter } from "@/gateways/index.ts";
import type { Gateways, SearchIndex } from "@/gateways/index.ts";
import { KbMapFormatter, KbMapService } from "@/modules/kb/index.ts";
import {
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  NoteService,
} from "@/modules/note/index.ts";
import { HOOK_DESCRIPTOR } from "@/modules/session/commands/hookDispatch/hookDispatch.constants.ts";
import { CompactCheckpointFormatter } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import { CompactCheckpointHook } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.hook.ts";
import { MemoryInjectFormatter } from "@/modules/session/hooks/memoryInject/memoryInject.formatter.ts";
import { MemoryInjectHook } from "@/modules/session/hooks/memoryInject/memoryInject.hook.ts";
import { SessionEndHook } from "@/modules/session/hooks/sessionEnd/sessionEnd.hook.ts";
import { SessionStartHook } from "@/modules/session/hooks/sessionStart/sessionStart.hook.ts";
import { WrapGateFormatter } from "@/modules/session/hooks/wrapGate/wrapGate.formatter.ts";
import { WrapGateHook } from "@/modules/session/hooks/wrapGate/wrapGate.hook.ts";
import {
  WorkingMemoryFormatter,
  WorklogFloorFormatter,
  WorklogProjection,
  WorklogQuery,
  WorklogService,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

export type HookOptions = { readonly name: string };

/** Exported so a test can pin it against the installer's registration table. */
export const dispatchableHookNames: readonly HookName[] = Object.values(HookName);

function makeSearchIndex(container: Gateways): SearchIndex {
  return new SearchIndexAdapter(container.fs, (path) => container.openDatabase(path));
}

function makeNoteModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const repository = new NoteRepository(container.fs, new NoteParser());
  const projection = new NoteProjection(index);
  const query = new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    noteService: new NoteService(repository, projection, query),
    buildKbMap: new KbMapService(container.fs, new NoteParser()),
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
    worklogService: new WorklogService(store, projection, query),
  };
}

@Command(HOOK_DESCRIPTOR)
export class HookDispatchCommand implements CommandContract<HookOptions> {
  constructor(
    private readonly container: Gateways,
    private readonly config: Config,
  ) {}

  parse(tokens: readonly string[]): Result<HookOptions, ArgsError> {
    const name = tokens[0];
    if (name === undefined)
      return { ok: false, error: { message: "hook: missing <name>" } };
    return { ok: true, value: { name } };
  }

  async run(options: HookOptions, _context: RunContext): Promise<CommandResult> {
    const outcome = await this.execute({ command: "hook", name: options.name });
    return { lines: [], ...outcome };
  }

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

  private async resolveWorkspaceForHook(cwd: AbsPath): Promise<Workspace | null> {
    const home = this.container.env.home();
    const { repository, resolverService } = makeWorkspaceContext(
      this.container.fs,
      this.container.git,
      this.container.proc,
    );
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      this.container.logger.error(
        `hook: registry load failed (${registryResult.error.kind}): ${registryResult.error.message}`,
      );
      return null;
    }
    return resolverService.resolveWorkspace(registryResult.value, cwd, home);
  }

  private async execute(args: {
    readonly command: string;
    readonly name: string;
  }): Promise<CliOutcome> {
    const name = this.parseHookName(args.name);
    if (name === null) {
      return cliOutcome(0, `memory hook '${args.name}': unknown hook name`);
    }

    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      this.container,
      payloadParser,
      new HookResultSerializer(),
      (cwd) => this.resolveWorkspaceForHook(cwd),
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
            note.noteService,
            worklog.worklogService,
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
            note.noteService,
            worklog.worklogService,
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
          new SessionEndHook(this.container, new WorklogFloorFormatter(), worklog.store),
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
