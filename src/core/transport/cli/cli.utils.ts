import type { Result } from "@/core/core.typedefs.ts";
import type {
  Command,
  CommandDescriptor,
  RegisteredCommand,
} from "@/core/entry/entry.typedefs.ts";
import {
  ARGS_PARSE_ERROR_EXIT_CODE,
  DEFAULT_FAILURE_EXIT_CODE,
} from "@/core/transport/cli/cli.constants.ts";
import type {
  ArgsError,
  CliOutcome,
  CommandResult,
  RunContext,
} from "@/core/transport/cli/cli.typedefs.ts";

/** A failure message printed to stderr, exiting 1 by default. */
export function cliFailure(
  message: string,
  exitCode: number = DEFAULT_FAILURE_EXIT_CODE,
): CliOutcome {
  return { exitCode, stderrMessage: message };
}

/** A diagnostic on stderr paired with an explicit exit code — the one shape
 * `cliFailure`'s "always exit 1" default doesn't cover. */
export function cliOutcome(exitCode: number, stderrMessage: string | null): CliOutcome {
  return { exitCode, stderrMessage };
}

/** Wraps a command in a type-erased registry entry. The spec comes from the
 * `@Command` decorator on the class, so a command missing its decorator fails here
 * at wiring time rather than silently routing nowhere. */
export function registerCommand<TOptions>(command: Command<TOptions>): RegisteredCommand {
  // SAFETY: every command is wired through `@Command`, which defines `spec` on the
  // class; `constructor` on an instance is always that class.
  const constructor = command as {
    readonly constructor: { readonly spec?: CommandDescriptor };
  };
  const spec = constructor.constructor.spec;
  if (spec === undefined) {
    throw new Error("command class is missing its @Command(...) descriptor");
  }

  return {
    spec,
    invoke(tokens: readonly string[], context: RunContext): Promise<CommandResult> {
      const parsed = command.parse(tokens);
      if (!parsed.ok) {
        return Promise.resolve({
          lines: [],
          exitCode: ARGS_PARSE_ERROR_EXIT_CODE,
          stderrMessage: parsed.error.message,
        });
      }
      return command.run(parsed.value, context);
    },
  };
}

/** Every flag is a long (`--foo`) or short (`-k`/`-m`) option. */
function isFlagToken(token: string): boolean {
  return token.startsWith("-");
}

export function hasFlag(tokens: readonly string[], flag: string): boolean {
  return tokens.includes(flag);
}

export function flagValue(tokens: readonly string[], flag: string): string | null {
  const index = tokens.indexOf(flag);
  if (index === -1) return null;
  return tokens[index + 1] ?? null;
}

export function variadicValues(
  tokens: readonly string[],
  flag: string,
): readonly string[] | null {
  const index = tokens.indexOf(flag);
  if (index === -1) return null;
  const values: string[] = [];
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token === undefined || isFlagToken(token)) break;
    values.push(token);
  }
  return values;
}

export function intFlag(
  tokens: readonly string[],
  flag: string,
  fallback: number,
): Result<number, string> {
  const raw = flagValue(tokens, flag);
  if (raw === null) return { ok: true, value: fallback };
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: `${flag}: expected an integer, got "${raw}"` };
  }
  return { ok: true, value: parsed };
}

export function requirePositional(
  tokens: readonly string[],
  name: string,
): Result<string, string> {
  const first = tokens[0];
  if (first === undefined) return { ok: false, error: `missing <${name}>` };
  return { ok: true, value: first };
}

/** The shared args-error shape, re-exported so commands never import the CLI
 * parser directly. */
export type { ArgsError };
