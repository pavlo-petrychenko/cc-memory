import { DEFAULT_FAILURE_EXIT_CODE } from "@/core/outcome/outcome.constants.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";

/** A failure message printed to stderr, exiting 1 by default. */
export function cliFailure(
  message: string,
  exitCode: number = DEFAULT_FAILURE_EXIT_CODE,
): CliOutcome {
  return { exitCode, stderrMessage: message };
}

/** A diagnostic on stderr paired with an explicit exit code — the one shape
 * `cliFailure`'s "always exit 1" default doesn't cover (see `CliOutcome`'s
 * doc comment). */
export function cliOutcome(exitCode: number, stderrMessage: string | null): CliOutcome {
  return { exitCode, stderrMessage };
}
