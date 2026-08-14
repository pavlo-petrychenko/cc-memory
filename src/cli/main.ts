import { CliCommand, parseArgs, type ParsedArgs } from "@/cli/args/index.ts";
import { HelpCommand } from "@/cli/help/index.ts";
import type { Config } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import { cliFailure } from "@/core/outcome/index.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/outcome/outcome.constants.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
import { DoctorCommand, InstallCommand, UninstallCommand } from "@/install/index.ts";
import type { Container } from "@/platform/index.ts";
import { AppContainer } from "@/platform/index.ts";
import {
  IndexBuildService,
  IndexConnectionService,
  NotesCommand,
  ReindexCommand,
  SearchCommand,
} from "@/retrieval/index.ts";
import { HookDispatchCommand } from "@/session/index.ts";
import { CommitCommand } from "@/worklog/index.ts";
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

/**
 * The one capability `WorkspaceCommand` needs from the search index, backed by
 * the real `retrieval` module — constructed here (the composition root)
 * rather than inside `workspace` itself, which would close a cycle (retrieval
 * depends on workspace for target resolution).
 */
function makeWorkspaceIndexBuilder(container: Container): WorkspaceIndexBuilder {
  return {
    buildIndex: async (workspace) =>
      (await new IndexBuildService().build(container, workspace)).total,
    noteCount: async (workspace) => {
      const { db } = await new IndexConnectionService().open(container, workspace);
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

/**
 * Dispatch a successfully-parsed `ParsedArgs` to its command class and
 * return the resulting `CliOutcome`. Exhaustive over `CliCommand` so adding a
 * subcommand without wiring it here is a compile error (the switch already
 * covers every member, so a missing case fails to type-check).
 *
 * `Install`/`Uninstall`/`Hook` construct their command with NO `container`
 * (or a freshly built real one), never the `container` this function
 * received — matching the previous thin-function dispatch exactly. Every
 * other command class is built from the container/config already threaded
 * through `runCli`.
 */
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
      return new ReindexCommand().execute(container, parsed);
    case CliCommand.Search:
      return new SearchCommand().execute(container, config, parsed);
    case CliCommand.Notes:
      return new NotesCommand().execute(container, parsed);
    case CliCommand.Commit:
      return new CommitCommand(
        container.fs,
        container.proc,
        container.env,
        container.stdio,
      ).execute(parsed);
    case CliCommand.Doctor:
      return new DoctorCommand(container).execute(parsed);
    case CliCommand.Hook:
      return new HookDispatchCommand(
        new AppContainer(process.env),
        new ConfigParser().parse(process.env),
      ).execute(parsed);
    case CliCommand.Install:
      return new InstallCommand().execute(parsed);
    case CliCommand.Uninstall:
      return new UninstallCommand().execute();
    case CliCommand.Help:
    case CliCommand.Version:
      return new HelpCommand(container.stdio).execute(parsed);
  }
}

/**
 * Build the real `Container`, parse `argv`, dispatch, map the result to a
 * `CliOutcome`. Kept as an exported, container-injected function (rather than
 * living inside the `import.meta.main` guard) so it's testable in-process
 * with a fake `Container` — the guard below only does the two things that
 * genuinely need the real process: reading `process.argv`/`process.env`, and
 * writing to real stderr (`Stdio` has no stderr method — see `CliOutcome`'s
 * doc comment).
 */
export async function runCli(
  argv: readonly string[],
  container: Container,
  config: Config,
): Promise<CliOutcome> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return cliFailure(parsed.error.message, ARGS_PARSE_ERROR_EXIT_CODE);
  return dispatch(container, config, parsed.value);
}

// No work at import time — everything below only runs when this module IS
// the entrypoint, which `tests/unit/coverageSurface.test.ts` importing every
// module does not trigger.
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
