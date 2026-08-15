import type { Stdio } from "@/gateways/stdio/stdio.typedefs.ts";

/** The real `Stdio`, reading stdin, writing stdout, and exiting the process. */
export class StdioAdapter implements Stdio {
  readStdin(): Promise<string> {
    return Bun.stdin.text();
  }

  write(text: string): void {
    process.stdout.write(`${text}\n`);
  }

  exit(code: number): void {
    process.exit(code);
  }
}
