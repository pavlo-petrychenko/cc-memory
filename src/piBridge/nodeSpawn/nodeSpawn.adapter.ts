import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { MEMORY_BIN_HOME_RELATIVE_PATH } from "@/piBridge/piBridge.constants.ts";
import type {
  LogPort,
  ProcessSpawnPort,
  SpawnOutcome,
} from "@/piBridge/piBridge.typedefs.ts";

/** The bridge's only ambient read: where the installed CLI shim lives. */
export function defaultMemoryBinPath(): string {
  return join(homedir(), MEMORY_BIN_HOME_RELATIVE_PATH.slice(2));
}

/** Forwards a failure to stderr — pi logs extension output without letting it
 * corrupt the session. */
export const logToStderr: LogPort = (message) => {
  console.error(`[cc-memory] ${message}`);
};

/** Spawns a child that receives `input` on stdin, collects its stdout, and is
 * killed after `timeoutMs`. Resolves rather than rejects: failures are encoded
 * in the outcome so dispatch can log and continue. */
export const nodeSpawn: ProcessSpawnPort = (command, args, options) => {
  return new Promise<SpawnOutcome>((resolvePromise) => {
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolvePromise({
          ok: false,
          stdout,
          stderr: `${stderr}timed out after ${options.timeoutMs}ms`,
        });
        return;
      }
      resolvePromise({ ok: code === 0, stdout, stderr });
    });

    child.stdin?.write(options.input);
    child.stdin?.end();
  });
};
