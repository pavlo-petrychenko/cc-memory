import type { HelpArgs, VersionArgs } from "@/cli/args/index.ts";
import { CliCommand } from "@/cli/args/index.ts";
import { USAGE } from "@/cli/help/help.constants.ts";
import { CLI_SUCCESS } from "@/core/outcome/index.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
import type { Stdio } from "@/platform/index.ts";
import { CC_MEMORY_VERSION } from "@/version.ts";

/**
 * `-h`/`--help` (and a bare `memory` with no arguments), plus `--version`.
 */
export class HelpCommand {
  constructor(private readonly stdio: Stdio) {}

  execute(args: HelpArgs | VersionArgs): CliOutcome {
    if (args.command === CliCommand.Version) {
      this.stdio.write(`memory ${CC_MEMORY_VERSION}\n`);
      return CLI_SUCCESS;
    }
    this.stdio.write(USAGE);
    return CLI_SUCCESS;
  }
}
