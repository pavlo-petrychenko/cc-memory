import { parseArgs } from "@/cli/args/args.parser.ts";
import { CliCommand, type ParsedArgs } from "@/cli/args/args.typedefs.ts";
import { HelpCommand } from "@/cli/help/help.command.ts";
import { HelpFormatter } from "@/cli/help/help.formatter.ts";
import type { Config } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import { cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/index.ts";
import {
  DoctorCommand,
  DoctorFormatter,
  DoctorService,
  InstallCommand,
  UninstallCommand,
} from "@/install/index.ts";
import type { Container } from "@/platform/index.ts";
import { AppContainer } from "@/platform/index.ts";
import {
  FtsQueryBuilder,
  IndexBuildService,
  IndexConnectionService,
  LinkGraphService,
  NoteListService,
  NotesCommand,
  NotesFormatter,
  Ranker,
  ReindexCommand,
  ReindexFormatter,
  SchemaService,
  SearchCommand,
  SearchFormatter,
  SearchService,
  TokenizerParser,
} from "@/retrieval/index.ts";
import { HookDispatchCommand } from "@/session/index.ts";
import { CommitCommand, CommitFormatter } from "@/worklog/index.ts";
import {
  RegistryService,
  RegistryTomlSerializer,
  ResolveCommand,
  ResolveFormatter,
  TargetResolutionService,
  WorkspaceCommand,
  WorkspaceFormatter,
  WorkspaceResolverService,
} from "@/workspace/index.ts";
import type { WorkspaceIndexBuilder } from "@/workspace/index.ts";

/** The composition root: no command constructs its own dependencies, each is wired
 * here from the real `Container`. */
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

function makeNoteListService(): NoteListService {
  return new NoteListService(makeIndexConnectionService());
}

/** Backed by `retrieval`, constructed here rather than inside `workspace` itself,
 * which would close a cycle (retrieval depends on workspace for target resolution). */
function makeWorkspaceIndexBuilder(container: Container): WorkspaceIndexBuilder {
  return {
    buildIndex: async (workspace) =>
      (await makeIndexBuildService().build(container, workspace)).total,
    noteCount: async (workspace) => {
      const { db } = await makeIndexConnectionService().open(container, workspace);
      const row = db.query<{ readonly "COUNT(*)": number }>(
        "SELECT COUNT(*) FROM notes",
        [],
      )[0];
      return row?.["COUNT(*)"] ?? 0;
    },
  };
}

function makeWorkspaceCommand(container: Container): WorkspaceCommand {
  const registryService = new RegistryService(container.fs, new RegistryTomlSerializer());
  const resolverService = new WorkspaceResolverService(registryService, container.git);
  const targetResolutionService = new TargetResolutionService(
    registryService,
    resolverService,
  );
  return new WorkspaceCommand(
    container.fs,
    container.env,
    container.proc,
    container.stdio,
    registryService,
    targetResolutionService,
    makeWorkspaceIndexBuilder(container),
    new WorkspaceFormatter(),
  );
}

function makeResolveCommand(container: Container): ResolveCommand {
  const registryService = new RegistryService(container.fs, new RegistryTomlSerializer());
  const resolverService = new WorkspaceResolverService(registryService, container.git);
  const targetResolutionService = new TargetResolutionService(
    registryService,
    resolverService,
  );
  return new ResolveCommand(
    container.env,
    container.stdio,
    targetResolutionService,
    resolverService,
    new ResolveFormatter(),
  );
}

/** Exhaustive over `CliCommand`, so a missing subcommand is a compile error.
 * `Install`/`Uninstall`/`Hook` ignore `container` and act on the real machine (see
 * the root `CLAUDE.md`'s Traps). */
async function dispatch(
  container: Container,
  config: Config,
  parsed: ParsedArgs,
): Promise<CliOutcome> {
  switch (parsed.command) {
    case CliCommand.WorkspaceAdd:
      return makeWorkspaceCommand(container).add(parsed);
    case CliCommand.WorkspaceRm:
      return makeWorkspaceCommand(container).rm(parsed);
    case CliCommand.WorkspaceLs:
      return makeWorkspaceCommand(container).ls();
    case CliCommand.Resolve:
      return makeResolveCommand(container).execute(parsed);
    case CliCommand.Reindex:
      return new ReindexCommand(makeIndexBuildService(), new ReindexFormatter()).execute(
        container,
        parsed,
      );
    case CliCommand.Search:
      return new SearchCommand(makeSearchService(), new SearchFormatter()).execute(
        container,
        config,
        parsed,
      );
    case CliCommand.Notes:
      return new NotesCommand(makeNoteListService(), new NotesFormatter()).execute(
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
        new DoctorService(container, makeIndexBuildService()),
        new DoctorFormatter(),
      ).execute(parsed);
    case CliCommand.Hook:
      return new HookDispatchCommand(
        new AppContainer(process.env),
        new ConfigParser().parse(process.env),
      ).execute(parsed);
    case CliCommand.Install:
      return new InstallCommand(new AppContainer(process.env)).execute(parsed);
    case CliCommand.Uninstall:
      return new UninstallCommand(new AppContainer(process.env)).execute();
    case CliCommand.Help:
    case CliCommand.Version:
      return new HelpCommand(container.stdio, new HelpFormatter()).execute(parsed);
  }
}

/** Kept outside the `import.meta.main` guard so it's testable in-process with a
 * fake `Container`; the guard below only reads the real `process.argv`/`process.env`
 * and writes real stderr (`Stdio` has no stderr method). */
export async function runCli(
  argv: readonly string[],
  container: Container,
  config: Config,
): Promise<CliOutcome> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return cliFailure(parsed.error.message, ARGS_PARSE_ERROR_EXIT_CODE);
  return dispatch(container, config, parsed.value);
}

if (import.meta.main) {
  const envSnapshot = process.env;
  const container = new AppContainer(envSnapshot);
  const config = new ConfigParser().parse(envSnapshot);
  const outcome = await runCli(process.argv.slice(2), container, config);
  if (outcome.stderrMessage !== null) {
    process.stderr.write(`${outcome.stderrMessage}\n`);
  }
  container.stdio.exit(outcome.exitCode);
}
