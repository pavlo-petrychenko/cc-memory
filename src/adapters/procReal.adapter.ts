import type { Proc, ProcResult, ProcRunOptions } from "../ports/proc.port.ts";

/**
 * The real `Proc`, over `Bun.spawn`. Captures stdout/stderr as text and rejects
 * on timeout — matching `subprocess.run(..., timeout=N)` raising
 * `TimeoutExpired`, which every Python call site this replaces catches alongside
 * every other failure (`git.port.ts`'s doc comment). A killed-for-timeout process
 * has no meaningful exit code to report, so there is nothing useful to put in a
 * `ProcResult` — the rejection IS the signal.
 */
export function makeProcRealAdapter(): Proc {
  return {
    run: async (
      command: string,
      args: readonly string[],
      options: ProcRunOptions,
    ): Promise<ProcResult> => {
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
      if (options.env !== undefined)
        spawnOptions.env = { ...process.env, ...options.env };

      const child = Bun.spawn([command, ...args], spawnOptions);

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
    },
  };
}
