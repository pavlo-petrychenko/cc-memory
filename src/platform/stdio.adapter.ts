import type { Stdio } from "./stdio.typedefs.ts";

/** The real `Stdio`, reading stdin, writing stdout, and exiting the process. */
export function makeStdioAdapter(): Stdio {
  return {
    readStdin: () => Bun.stdin.text(),
    write: (text: string) => {
      process.stdout.write(`${text}\n`);
    },
    exit: (code: number) => {
      process.exit(code);
    },
  };
}
