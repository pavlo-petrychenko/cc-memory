import { parseArgs } from "@/cli/args/args.parser.ts";
import { CliCommand, type ParsedArgs } from "@/cli/args/args.typedefs.ts";
import { HelpCommand } from "@/cli/help/help.command.ts";
import { HelpFormatter } from "@/cli/help/help.formatter.ts";
import { ReindexCommand } from "@/cli/reindex.command.ts";
import { ReindexFormatter } from "@/cli/reindex.formatter.ts";
import { SearchCommand } from "@/cli/search.command.ts";
import type { Config } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import { cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { AppGateways, SearchIndexAdapter } from "@/gateways/index.ts";
import type { Gateways, SearchIndex } from "@/gateways/index.ts";
import {
  DoctorCommand,
  DoctorFormatter,
  DoctorService,
  InstallCommand,
  UninstallCommand,
} from "@/modules/installation/index.ts";
import { NotesCommand } from "@/modules/note/index.ts";
import {
  BuildKbMapUseCase,
  KbMapService,
  ListNotesUseCase,
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  ReprojectNotesUseCase,
  SearchNotesUseCase,
} from "@/modules/note/index.ts";
import { NotesFormatter } from "@/modules/note/index.ts";
import { SearchFormatter } from "@/modules/note/index.ts";
import { HookDispatchCommand } from "@/modules/session/index.ts";
import {
  CommitCommand,
  CommitFormatter,
  ReprojectWorklogUseCase,
  SearchWorklogUseCase,
  WorklogProjection,
  WorklogQuery,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import {
  makeWorkspaceContext,
  ResolveCommand,
  ResolveFormatter,
  WorkspaceCommand,
  WorkspaceFormatter,
} from "@/modules/workspace/index.ts";
import type { WorkspaceIndexBuilder } from "@/modules/workspace/index.ts";

/** The composition root: no command constructs its own dependencies, each is wired
 * here from the real `Gateways`. */
function makeSearchIndex(container: Gateways): SearchIndex {
  return new SearchIndexAdapter(container.fs, (path) => container.openDatabase(path));
}

function makeNoteModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const repository = new NoteRepository(container.fs, new NoteParser());
  const projection = new NoteProjection(index);
  const query = new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    projection,
    reprojectNotes: new ReprojectNotesUseCase(repository, projection),
    searchNotes: new SearchNotesUseCase(query),
    listNotes: new ListNotesUseCase(repository),
    buildKbMap: new BuildKbMapUseCase(new KbMapService(container.fs, new NoteParser())),
  };
}

function makeWorklogModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const store = new WorklogStoreService(container.fs, container.git);
  const projection = new WorklogProjection(index);
  const query = new WorklogQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    reprojectWorklog: new ReprojectWorklogUseCase(store, projection),
    searchWorklog: new SearchWorklogUseCase(query),
  };
}

function makeWorkspaceIndexBuilder(
  note: ReturnType<typeof makeNoteModule>,
): WorkspaceIndexBuilder {
  return {
    buildIndex: async (workspace) =>
      (await note.reprojectNotes.run(workspace, { incremental: false })).total,
    noteCount: async (workspace) => (await note.projection.listExisting(workspace)).size,
  };
}

function makeWorkspaceCommand(
  container: Gateways,
  note: ReturnType<typeof makeNoteModule>,
): WorkspaceCommand {
  const { repository, validatorService, targetResolutionService } = makeWorkspaceContext(
    container.fs,
    container.git,
  );
  return new WorkspaceCommand(
    container.fs,
    container.env,
    container.proc,
    container.stdio,
    repository,
    validatorService,
    targetResolutionService,
    makeWorkspaceIndexBuilder(note),
    new WorkspaceFormatter(),
  );
}

function makeResolveCommand(container: Gateways): ResolveCommand {
  const { repository, resolverService } = makeWorkspaceContext(
    container.fs,
    container.git,
  );
  return new ResolveCommand(
    container.env,
    container.stdio,
    repository,
    resolverService,
    new ResolveFormatter(),
  );
}

/** Exhaustive over `CliCommand`, so a missing subcommand is a compile error.
 * `Install`/`Uninstall`/`Hook` ignore `container` and act on the real machine (see
 * the root `CLAUDE.md`'s Traps). */
async function dispatch(
  container: Gateways,
  config: Config,
  parsed: ParsedArgs,
): Promise<CliOutcome> {
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);

  switch (parsed.command) {
    case CliCommand.WorkspaceAdd:
      return makeWorkspaceCommand(container, note).add(parsed);
    case CliCommand.WorkspaceRm:
      return makeWorkspaceCommand(container, note).rm(parsed);
    case CliCommand.WorkspaceLs:
      return makeWorkspaceCommand(container, note).ls();
    case CliCommand.Resolve:
      return makeResolveCommand(container).execute(parsed);
    case CliCommand.Reindex:
      return new ReindexCommand(
        note.reprojectNotes,
        worklog.reprojectWorklog,
        new ReindexFormatter(),
      ).execute(container, parsed);
    case CliCommand.Search:
      return new SearchCommand(
        note.searchNotes,
        worklog.searchWorklog,
        new SearchFormatter(),
      ).execute(container, config, parsed);
    case CliCommand.Notes:
      return new NotesCommand(note.listNotes, new NotesFormatter()).execute(
        container,
        parsed,
      );
    case CliCommand.Commit:
      return new CommitCommand(
        container.fs,
        container.proc,
        container.env,
        container.stdio,
        container.git,
        new CommitFormatter(),
      ).execute(parsed);
    case CliCommand.Doctor:
      return new DoctorCommand(
        container,
        new DoctorService(container, note.reprojectNotes, worklog.reprojectWorklog),
        new DoctorFormatter(),
      ).execute(parsed);
    case CliCommand.Hook:
      return new HookDispatchCommand(
        new AppGateways(process.env),
        new ConfigParser().parse(process.env),
      ).execute(parsed);
    case CliCommand.Install:
      return new InstallCommand(new AppGateways(process.env)).execute(parsed);
    case CliCommand.Uninstall:
      return new UninstallCommand(new AppGateways(process.env)).execute();
    case CliCommand.Help:
    case CliCommand.Version:
      return new HelpCommand(container.stdio, new HelpFormatter()).execute(parsed);
  }
}

/** Kept outside the `import.meta.main` guard so it's testable in-process with a
 * fake `Gateways`; the guard below only reads the real `process.argv`/`process.env`
 * and writes real stderr (`Stdio` has no stderr method). */
export async function runCli(
  argv: readonly string[],
  container: Gateways,
  config: Config,
): Promise<CliOutcome> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return cliFailure(parsed.error.message, ARGS_PARSE_ERROR_EXIT_CODE);
  return dispatch(container, config, parsed.value);
}

if (import.meta.main) {
  const envSnapshot = process.env;
  const container = new AppGateways(envSnapshot);
  const config = new ConfigParser().parse(envSnapshot);
  const outcome = await runCli(process.argv.slice(2), container, config);
  if (outcome.stderrMessage !== null) {
    process.stderr.write(`${outcome.stderrMessage}\n`);
  }
  container.stdio.exit(outcome.exitCode);
}
