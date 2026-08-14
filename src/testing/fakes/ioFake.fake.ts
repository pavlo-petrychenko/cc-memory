import type { Stdio } from "../../platform/stdio.typedefs.ts";

export type IoFake = Stdio & {
  readonly written: readonly string[];
  readonly exitCode: number | null;
  readonly setStdin: (text: string) => void;
};

/**
 * A `Stdio` that hands back a scripted stdin string and collects every write
 * instead of touching the real process — what lets `hooks/runtime.ts` and
 * `cli/main.ts` be tested by feeding a payload and asserting on captured
 * output, with no real `process.exit` ending the test run.
 */
export function makeIoFake(initialStdin = ""): IoFake {
  const written: string[] = [];
  let stdin = initialStdin;
  let exitCode: number | null = null;

  return {
    written,
    get exitCode() {
      return exitCode;
    },
    setStdin: (text: string) => {
      stdin = text;
    },
    readStdin: () => Promise.resolve(stdin),
    write: (text: string) => {
      written.push(text);
    },
    exit: (code: number) => {
      exitCode = code;
    },
  };
}
