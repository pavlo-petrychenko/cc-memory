import type { Result } from "@/core/core.typedefs.ts";
import type {
  ArgsError,
  CommandResult,
  RunContext,
} from "@/core/transport/cli/cli.typedefs.ts";

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

/** The transport-agnostic shape every command implements: map raw tokens to a
 * typed options value, then run the operation. The runner owns argv, stdio and
 * exit codes. */
export interface Command<TOptions> {
  parse(tokens: readonly string[]): Result<TOptions, ArgsError>;
  run(options: TOptions, context: RunContext): Promise<CommandResult>;
}

/** The type-erased registry entry: `invoke` parses with the command's own
 * `parse` and runs with its own `run`, so a heterogeneous command list stays in
 * one array with no type assertion. */
export type RegisteredCommand = {
  readonly spec: CommandDescriptor;
  readonly invoke: (
    tokens: readonly string[],
    context: RunContext,
  ) => Promise<CommandResult>;
};

/** The constructor shape `@Command` accepts: any class implementing `Command`. */
export type CommandClass = abstract new (...args: never[]) => Command<unknown>;
