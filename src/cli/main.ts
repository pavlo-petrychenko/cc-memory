import { CliCommand, parseArgs, type ParsedArgs } from "@/cli/args/index.ts";
import { help, version } from "@/cli/help/index.ts";
import type { Config } from "@/core/index.ts";
import { parseConfig } from "@/core/index.ts";
import { cliFailure } from "@/core/outcome/index.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/outcome/outcome.constants.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
import { doctor } from "@/install/index.ts";
import { install, uninstall } from "@/install/index.ts";
import type { Container } from "@/platform/index.ts";
import { makeRealContainer } from "@/platform/index.ts";
import { notes } from "@/retrieval/index.ts";
import { reindex } from "@/retrieval/index.ts";
import { search } from "@/retrieval/index.ts";
import { hook } from "@/session/index.ts";
import { commit } from "@/worklog/index.ts";
import { resolve } from "@/workspace/index.ts";
import { workspaceAdd, workspaceLs, workspaceRm } from "@/workspace/index.ts";

/**
 * Dispatch a successfully-parsed `ParsedArgs` to its command function and
 * return the resulting `CliOutcome`. Exhaustive over `CliCommand` so adding a
 * subcommand without wiring it here is a compile error (the switch already
 * covers every member, so a missing case fails to type-check).
 */
async function dispatch(
  container: Container,
  config: Config,
  parsed: ParsedArgs,
): Promise<CliOutcome> {
  switch (parsed.command) {
    case CliCommand.WorkspaceAdd:
      return workspaceAdd(container, parsed);
    case CliCommand.WorkspaceRm:
      return workspaceRm(container, parsed);
    case CliCommand.WorkspaceLs:
      return workspaceLs(container);
    case CliCommand.Resolve:
      return resolve(container, parsed);
    case CliCommand.Reindex:
      return reindex(container, parsed);
    case CliCommand.Search:
      return search(container, config, parsed);
    case CliCommand.Notes:
      return notes(container, parsed);
    case CliCommand.Commit:
      return commit(container, parsed);
    case CliCommand.Doctor:
      return doctor(container, parsed);
    case CliCommand.Hook:
      return hook(parsed);
    case CliCommand.Install:
      return install(parsed);
    case CliCommand.Uninstall:
      return uninstall();
    case CliCommand.Help:
      return help(container.stdio);
    case CliCommand.Version:
      return version(container.stdio);
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
  const container = makeRealContainer(envSnapshot);
  const config = parseConfig(envSnapshot);
  const outcome = await runCli(process.argv.slice(2), container, config);
  if (outcome.stderrMessage !== null) {
    process.stderr.write(`${outcome.stderrMessage}\n`);
  }
  container.stdio.exit(outcome.exitCode);
}
