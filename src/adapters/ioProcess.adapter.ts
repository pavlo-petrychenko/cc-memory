import type { Stdio } from "../ports/stdio.port.ts";

/**
 * The real `Stdio`, over the actual process — `sys.stdin.read()`,
 * `print(...)` and `sys.exit(code)` (every `*.py` hook's `main()`/`__main__`
 * block, and `bin/memory`'s command dispatch).
 */
export function makeIoProcessAdapter(): Stdio {
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
