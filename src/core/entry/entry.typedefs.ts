import type { Config } from "@/core/config/config.typedefs.ts";
import type { AbsPath } from "@/core/core.typedefs.ts";
import type { Result } from "@/core/core.typedefs.ts";

/** The ambient process context the runner resolves once and hands to every
 * command's `run` — the command itself never reads `env`/`cwd`/config. */
export type RunContext = {
  readonly home: AbsPath;
  readonly cwd: AbsPath;
  readonly config: Config;
};

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

/** The closed set of subcommands, shared by the CLI parser and every command's
 * args type so a module never imports `cli/` just for a discriminant. */
export enum CliCommand {
  WorkspaceAdd = "workspace_add",
  WorkspaceRm = "workspace_rm",
  WorkspaceLs = "workspace_ls",
  Resolve = "resolve",
  Reindex = "reindex",
  Search = "search",
  Notes = "notes",
  Commit = "commit",
  Doctor = "doctor",
  Hook = "hook",
  Install = "install",
  Uninstall = "uninstall",
  /** `-h`/`--help`, or no arguments at all. */
  Help = "help",
  Version = "version",
}

/** One `CCMEM_*` tunable rendered in the `--help` environment section. */
export type EnvVarDescriptor = {
  readonly name: string;
  readonly description: string;
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
