import type { Config } from "@/core/config/config.typedefs.ts";
import type { AbsPath } from "@/core/core.typedefs.ts";

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

export type ArgsError = { readonly message: string };

/** One `CCMEM_*` tunable rendered in the `--help` environment section. */
export type EnvVarDescriptor = {
  readonly name: string;
  readonly description: string;
};
