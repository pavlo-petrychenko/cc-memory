/** A command's result, before `main.ts` maps it to a process exit — every command
 * returns one instead of calling `process.exit`/throwing itself. `cliOutcome`
 * covers a diagnostic on stderr paired with exit code **0**, for commands that
 * must stay fail-open. */
export type CliOutcome = {
  readonly exitCode: number;
  readonly stderrMessage: string | null;
};
