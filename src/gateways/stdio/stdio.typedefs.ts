/** Process stdio, as a seam: going through this port instead of
 * `process.stdin`/`console.log`/`process.exit` directly is what lets a hook or the
 * CLI be tested with a fake stdin and no real process exit ending the test run. */
export type Stdio = {
  readonly readStdin: () => Promise<string>;
  readonly write: (text: string) => void;
  readonly writeStderr: (text: string) => void;
  readonly exit: (code: number) => void;
};
