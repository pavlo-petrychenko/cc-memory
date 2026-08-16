import type { CommandHandler } from "@/core/decorators/command.decorator.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/transport/cli/cli.constants.ts";
import type { CommandResult } from "@/core/transport/cli/cli.typedefs.ts";

function pathMatches(path: readonly string[], argv: readonly string[]): boolean {
  if (argv.length < path.length) return false;
  return path.every((segment, index) => argv[index] === segment);
}

/** Longest `path` that prefixes argv wins, so `workspace` + `workspace add` can
 * coexist without ambiguity. `-h`/`--help`/`-V`/`--version` and a bare argv are
 * routed to the help/version commands explicitly. */
export function matchCommand(
  commands: readonly CommandHandler[],
  argv: readonly string[],
): { readonly command: CommandHandler; readonly rest: readonly string[] } | null {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    const help = commands.find((command) => command.path[0] === "-h");
    return help === undefined ? null : { command: help, rest: [] };
  }
  if (argv[0] === "-V" || argv[0] === "--version") {
    const version = commands.find((command) => command.path[0] === "-V");
    return version === undefined ? null : { command: version, rest: [] };
  }

  let best: {
    readonly command: CommandHandler;
    readonly rest: readonly string[];
  } | null = null;
  for (const command of commands) {
    if (!pathMatches(command.path, argv)) continue;
    if (best === null || command.path.length > best.command.path.length) {
      best = { command, rest: argv.slice(command.path.length) };
    }
  }
  return best;
}

/** The transport shell: match argv to a registered command, then run it. No I/O
 * here — the caller writes the result's lines and stderr and exits. */
export async function runCli(
  argv: readonly string[],
  commands: readonly CommandHandler[],
): Promise<CommandResult> {
  const match = matchCommand(commands, argv);
  if (match === null) {
    return {
      lines: [],
      exitCode: ARGS_PARSE_ERROR_EXIT_CODE,
      stderrMessage: `unknown command: ${argv[0] ?? ""}`,
    };
  }
  return match.command.invoke(match.rest);
}
