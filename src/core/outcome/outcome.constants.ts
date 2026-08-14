import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";

/** `cliFailure`'s default exit code, for callers that just need "a failure". */
export const DEFAULT_FAILURE_EXIT_CODE = 1;

/** Argument-parsing failures exit distinctly from a command's own failures, so
 * a usage error is never mistaken for a command having run and failed. */
export const ARGS_PARSE_ERROR_EXIT_CODE = 2;

export const CLI_SUCCESS: CliOutcome = { exitCode: 0, stderrMessage: null };
