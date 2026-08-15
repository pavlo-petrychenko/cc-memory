import { CliCommand, type HelpArgs, type VersionArgs } from "@/cli/args/args.typedefs.ts";
import {
  COMMAND_DESCRIPTORS,
  ENV_VAR_DESCRIPTORS,
  USAGE_HEADER,
} from "@/cli/help/help.constants.ts";
import { HelpFormatter } from "@/cli/help/help.formatter.ts";
import { CLI_SUCCESS } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import type { Stdio } from "@/gateways/index.ts";
import { CC_MEMORY_VERSION } from "@/version.ts";

/**
 * `-h`/`--help` (and a bare `memory` with no arguments), plus `--version`.
 */
export class HelpCommand {
  constructor(
    private readonly stdio: Stdio,
    private readonly formatter: HelpFormatter,
  ) {}

  execute(args: HelpArgs | VersionArgs): CliOutcome {
    if (args.command === CliCommand.Version) {
      this.stdio.write(`memory ${CC_MEMORY_VERSION}\n`);
      return CLI_SUCCESS;
    }
    this.stdio.write(
      this.formatter.render(USAGE_HEADER, COMMAND_DESCRIPTORS, ENV_VAR_DESCRIPTORS),
    );
    return CLI_SUCCESS;
  }
}
