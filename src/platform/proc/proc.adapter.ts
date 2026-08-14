import { COMMAND_NOT_FOUND_EXIT_CODE } from "@/platform/proc/proc.constants.ts";
import type { Proc, ProcResult, ProcRunOptions } from "@/platform/proc/proc.typedefs.ts";

/**
 * The real `Proc`, over `Bun.spawn`. Captures stdout/stderr as text and rejects
 * on timeout. A killed-for-timeout process has no meaningful exit code to
 * report, so there is nothing useful to put in a `ProcResult` — the rejection
 * IS the signal.
 */
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

    // `Bun.spawn` THROWS when the binary does not exist, rather than resolving
    // with a failure — but a missing tool is a normal condition here, not an
    // exceptional one: `git` need not be installed, and every caller already
    // treats a non-zero exit as "this did not work". Catching the throw and
    // reporting exit code 127, the shell's conventional "command not found",
    // lets those callers handle it without knowing anything new, and keeps a
    // missing binary from crashing a command mid-run.
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
