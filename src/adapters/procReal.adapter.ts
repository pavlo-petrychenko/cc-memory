import type { Proc, ProcResult, ProcRunOptions } from "../ports/proc.port.ts";

/**
 * The real `Proc`, over `Bun.spawn`. Captures stdout/stderr as text and rejects
 * on timeout — matching `subprocess.run(..., timeout=N)` raising
 * `TimeoutExpired`, which every Python call site this replaces catches alongside
 * every other failure (`git.port.ts`'s doc comment). A killed-for-timeout process
 * has no meaningful exit code to report, so there is nothing useful to put in a
 * `ProcResult` — the rejection IS the signal.
 */
/** The shell's conventional exit code for "command not found". */
const COMMAND_NOT_FOUND_EXIT_CODE = 127;

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

      // `Bun.spawn` THROWS when the binary does not exist, rather than resolving
      // with a failure. Every Python call site this replaces wrapped its
      // `subprocess.run` in a try/except and carried on (`_git` returns ""), and a
      // missing optional tool is normal: `launchctl` does not exist off macOS,
      // `tmux` and `claude` may not be installed. Surfacing that as an exception
      // made `memory doctor` crash on Linux instead of reporting "launchd: not
      // loaded" — caught by CI. 127 is the shell's conventional
      // "command not found" code, so callers that already check `exitCode !== 0`
      // handle it without knowing anything new.
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
    },
  };
}
