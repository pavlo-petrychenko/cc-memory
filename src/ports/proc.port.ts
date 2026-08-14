import type { AbsPath } from "../domain/AbsPath.ts";

/**
 * A finished child process's captured output — `subprocess.run(...,
 * capture_output=True, text=True)`'s three readable fields (`resolve.py:31-34`,
 * `wrap-gate.py:30-32`, `worklog.py:109-113`, and every other `subprocess.run`
 * call this project ports).
 */
export type ProcResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/**
 * Options for one `Proc.run` call. All optional, mirroring `subprocess.run`'s
 * keyword arguments: `input` (text piped to stdin — used by the reflector's
 * `claude -p` call, [[bugfixes]] #8), `timeoutMs` (every call site in this
 * project sets one explicitly; see `git.port.ts`'s per-method timeouts), `cwd`
 * (`-C cwd` is passed as an argv element for git, but other commands rely on
 * process cwd), `env` (additive to the process environment, not a replacement —
 * matching `subprocess.run(env=...)` semantics of a full override is NOT what any
 * call site here needs).
 */
export type ProcRunOptions = {
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly cwd?: AbsPath;
  readonly env?: Readonly<Record<string, string>>;
};

/**
 * Spawn one child process and capture its output. The sole seam between the
 * codebase and `child_process`/`Bun.spawn` — `Git` is implemented over this
 * (never `child_process` directly) so git interactions are assertable, and the
 * reflector's `claude -p` and tmux calls (P8) go through it too.
 *
 * **Timeout is a rejection, not a result field** — matching `subprocess.run`
 * raising `TimeoutExpired` (an exception the Python callers catch alongside every
 * other failure: missing binary, non-zero exit is NOT a rejection here, only a
 * `ProcResult.exitCode !== 0`). This is what lets `Git`'s real adapter reproduce
 * "non-zero exit or any exception -> empty string" with one `try/catch` around a
 * single `await proc.run(...)`.
 */
export type Proc = {
  readonly run: (
    command: string,
    args: readonly string[],
    options: ProcRunOptions,
  ) => Promise<ProcResult>;
};
