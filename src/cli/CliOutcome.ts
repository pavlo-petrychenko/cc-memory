/**
 * A command's result, before `main.ts` maps it to a process exit. Every command
 * command function returns one of these instead of calling
 * `process.exit`/throwing itself — `main.ts` is the single place that turns it
 * into `stdio.exit(...)` plus (optionally) one line on stderr.
 *
 * This is the TypeScript shape of Python's two exit idioms in `bin/memory`:
 * a bare `return` after printing to stdout (`exitCode: 0, stderrMessage: null`),
 * and `sys.exit("msg")` — which prints `msg` to STDERR and exits 1
 * (`{ exitCode: 1, stderrMessage: "msg" }`). `cliOutcome` covers the one case
 * neither idiom needs on its own: a diagnostic on stderr with a **0** exit, used
 * by the `hook` stub (P7 not landed yet) to stay fail-open (CLAUDE.md invariant
 * #3) while still not pretending to have run a real handler.
 */
export type CliOutcome = {
  readonly exitCode: number;
  readonly stderrMessage: string | null;
};

export const CLI_SUCCESS: CliOutcome = { exitCode: 0, stderrMessage: null };

/** `sys.exit("msg")` (prints to stderr, exits 1 by default). */
export function cliFailure(message: string, exitCode: number = 1): CliOutcome {
  return { exitCode, stderrMessage: message };
}

/** A diagnostic on stderr paired with an explicit exit code — the one shape
 * `cliFailure`'s "always exit 1" default doesn't cover (see doc comment above). */
export function cliOutcome(exitCode: number, stderrMessage: string | null): CliOutcome {
  return { exitCode, stderrMessage };
}
