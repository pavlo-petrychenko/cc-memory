import { COMMAND_NOT_FOUND_EXIT_CODE } from "@/platform/proc/proc.constants.ts";
import type { Proc, ProcResult, ProcRunOptions } from "@/platform/proc/proc.typedefs.ts";

/** The real `Proc`, over `Bun.spawn`. Rejects on timeout — a killed process has no
 * meaningful exit code, so the rejection IS the signal. */
export class ProcAdapter implements Proc {
  async run(
    command: string,
    args: readonly string[],
    options: ProcRunOptions,
  ): Promise<ProcResult> {
    const spawnOptions: Bun.SpawnOptions.OptionsObject<
      "ignore" | "pipe",
      "pipe",
      "pipe"
    > = {
      stdin: options.input === undefined ? "ignore" : "pipe",
      stdout: "pipe",
      stderr: "pipe",
    };
    if (options.cwd !== undefined) spawnOptions.cwd = options.cwd;
    if (options.env !== undefined) spawnOptions.env = { ...process.env, ...options.env };

    // `Bun.spawn` throws when the binary doesn't exist; catching it and reporting
    // exit code 127 ("command not found") lets every caller treat a missing tool
    // the same as any other non-zero exit, instead of crashing mid-run.
    let child: Bun.Subprocess<"ignore" | "pipe", "pipe", "pipe">;
    try {
      child = Bun.spawn([command, ...args], spawnOptions);
    } catch (spawnError) {
      return {
        stdout: "",
        stderr: spawnError instanceof Error ? spawnError.message : String(spawnError),
        exitCode: COMMAND_NOT_FOUND_EXIT_CODE,
      };
    }

    if (options.input !== undefined && child.stdin !== undefined) {
      child.stdin.write(options.input);
      await child.stdin.end();
    }

    const timeoutHandle =
      options.timeoutMs === undefined
        ? null
        : setTimeout(() => child.kill(), options.timeoutMs);

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);

    if (options.timeoutMs !== undefined && child.signalCode !== null) {
      throw new Error(`process timed out after ${options.timeoutMs}ms: ${command}`);
    }

    return { stdout, stderr, exitCode };
  }
}
