/**
 * Process stdio, as a seam: hook entrypoints read a JSON payload from stdin and
 * always print exactly one line of JSON before exiting 0 (C2); the CLI writes to
 * stdout and exits with a mapped code. Going through this port instead of
 * `process.stdin`/`console.log`/`process.exit` directly is what lets
 * `hooks/runtime.ts` and `cli/main.ts` be tested by feeding a fake stdin and
 * asserting on captured writes, with no real process exit ending the test run.
 */
export type Stdio = {
  /** The full stdin stream, read to completion — `sys.stdin.read()` (every `*.py` hook's `main()`). */
  readonly readStdin: () => Promise<string>;
  /** One line to stdout — every hook's `print(json.dumps(...))` and every CLI `print(...)`. */
  readonly write: (text: string) => void;
  readonly exit: (code: number) => void;
};
