import type { Result } from "@/core/core.typedefs.ts";

/** A command's result, before the runner maps it to process exit: the lines to
 * write on stdout, plus the exit code and optional stderr message. */
export type CommandResult = {
  readonly lines: readonly string[];
  readonly exitCode: number;
  readonly stderrMessage: string | null;
};

/** A CLI failure, decoupled from any process: an exit code plus a stderr message.
 * `cliOutcome` covers a diagnostic on stderr paired with exit code **0**, for
 * commands that must stay fail-open. */
export type CliOutcome = {
  readonly exitCode: number;
  readonly stderrMessage: string | null;
};

/** The transport metadata for one CLI subcommand, hoisted above its class by
 * `@Command`. `path` is the token sequence that routes to it (`["workspace",
 * "add"]`); `usage` is what `--help` renders. */
export type CommandDescriptor = {
  readonly path: readonly string[];
  readonly usage: readonly string[];
  readonly summary: string;
  /** Hidden commands are real and dispatchable but omitted from `--help`. */
  readonly hidden: boolean;
};

/** The transport metadata for one Claude Code hook, hoisted above its class by
 * `@Hook`. `event` and `timeoutSeconds` are exactly what the installer writes into
 * `settings.json`. */
export type HookDescriptor = {
  readonly name: string;
  readonly event: string;
  readonly timeoutSeconds: number;
};

export type ArgsError = { readonly message: string };

/** The transport-agnostic shape every command implements: map raw tokens to a
 * typed options value, then run the operation. The runner owns argv, stdio and
 * exit codes. */
export interface Command<TOptions> {
  parse(tokens: readonly string[]): Result<TOptions, ArgsError>;
  run(options: TOptions): Promise<CommandResult>;
}

/** The type-erased registry entry: `invoke` parses with the command's own
 * `parse` and runs with its own `run`, so a heterogeneous command list stays in
 * one array with no type assertion. */
export type RegisteredCommand = {
  readonly spec: CommandDescriptor;
  readonly invoke: (tokens: readonly string[]) => Promise<CommandResult>;
};

/** The constructor shape `@Command` accepts: any class implementing `Command`. */
export type CommandClass = abstract new (...args: never[]) => Command<unknown>;
