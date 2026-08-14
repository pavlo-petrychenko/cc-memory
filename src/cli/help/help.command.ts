import { USAGE } from "@/cli/help/help.constants.ts";
import { CLI_SUCCESS } from "@/core/outcome/index.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
import type { Stdio } from "@/platform/index.ts";
import { CC_MEMORY_VERSION } from "@/version.ts";

/**
 * `-h`/`--help` (and a bare `memory` with no arguments), plus `--version`.
 */
export function help(stdio: Stdio): CliOutcome {
  stdio.write(USAGE);
  return CLI_SUCCESS;
}

export function version(stdio: Stdio): CliOutcome {
  stdio.write(`memory ${CC_MEMORY_VERSION}\n`);
  return CLI_SUCCESS;
}
