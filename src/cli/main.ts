import type { Container } from "../container.ts";
import { makeRealContainer } from "../container.ts";
import type { Config } from "../domain/Config.ts";
import { parseConfig } from "../domain/Config.ts";
import { CliCommand, parseArgs, type ParsedArgs } from "./args.ts";
import { type CliOutcome, cliFailure } from "./CliOutcome.ts";
import { commit } from "./commands/commit.command.ts";
import { doctor } from "./commands/doctor.command.ts";
import { help, version } from "./commands/help.command.ts";
import { hook } from "./commands/hook.command.ts";
import { install, uninstall } from "./commands/install.command.ts";
import { notes } from "./commands/notes.command.ts";
import { reflect } from "./commands/reflect.command.ts";
import { reindex } from "./commands/reindex.command.ts";
import { resolve } from "./commands/resolve.command.ts";
import { search } from "./commands/search.command.ts";
import { workspaceAdd, workspaceLs, workspaceRm } from "./commands/workspace.command.ts";

/**
 * `bin/memory:294-295`'s `a.func(a)` — dispatch a successfully-parsed
 * `ParsedArgs` to its command function and return the resulting `CliOutcome`.
 * Exhaustive over `CliCommand` so adding a subcommand without wiring it here
 * is a compile error (`noFallthroughCasesInSwitch`/a `never` check would
 * catch a missing case; the switch itself already covers every member).
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
    case CliCommand.Reflect:
      return reflect(container, parsed);
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
 * `bin/memory:main` (`253-299`): build the real `Container`, parse `argv`,
 * dispatch, map the result to a `CliOutcome`. Kept as an exported, container-
 * injected function (rather than living inside the `import.meta.main` guard)
 * so it's testable in-process with a fake `Container` — the guard below only
 * does the two things that genuinely need the real process: reading
 * `process.argv`/`process.env`, and writing to real stderr (`Stdio` has no
 * stderr method — see `CliOutcome`'s doc comment).
 */
export async function runCli(
  argv: readonly string[],
  container: Container,
  config: Config,
): Promise<CliOutcome> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return cliFailure(parsed.error.message, 2);
  return dispatch(container, config, parsed.value);
}

// No work at import time (CLAUDE.md) — everything below only runs when this
// module IS the entrypoint, which `tests/unit/coverageSurface.test.ts`
// importing every module does not trigger.
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
