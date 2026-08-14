/**
 * A command's result, before `main.ts` maps it to a process exit. Every
 * command function returns one of these instead of calling
 * `process.exit`/throwing itself — `main.ts` is the single place that turns it
 * into `stdio.exit(...)` plus (optionally) one line on stderr.
 *
 * Two shapes cover most cases: success with no message
 * (`exitCode: 0, stderrMessage: null`), and a failure message printed to
 * stderr with a non-zero exit. `cliOutcome` covers the remaining case: a
 * diagnostic on stderr paired with an exit code of **0**, used by commands
 * that must stay fail-open while still not pretending to have run cleanly.
 */
export type CliOutcome = {
  readonly exitCode: number;
  readonly stderrMessage: string | null;
};

export const CLI_SUCCESS: CliOutcome = { exitCode: 0, stderrMessage: null };

/** A failure message printed to stderr, exiting 1 by default. */
export function cliFailure(message: string, exitCode: number = 1): CliOutcome {
  return { exitCode, stderrMessage: message };
}

/** A diagnostic on stderr paired with an explicit exit code — the one shape
 * `cliFailure`'s "always exit 1" default doesn't cover (see doc comment above). */
export function cliOutcome(exitCode: number, stderrMessage: string | null): CliOutcome {
  return { exitCode, stderrMessage };
}
