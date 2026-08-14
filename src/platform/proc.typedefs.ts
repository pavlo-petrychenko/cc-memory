import type { AbsPath } from "../core/AbsPath.ts";

/** A finished child process's captured output. */
export type ProcResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/**
 * Options for one `Proc.run` call. All optional: `input` (text piped to
 * stdin), `timeoutMs` (every call
 * site in this project sets one explicitly; see `git.typedefs.ts`'s per-method
 * timeouts), `cwd` (`-C cwd` is passed as an argv element for git, but other
 * commands rely on process cwd), `env` (additive to the process environment,
 * not a full replacement).
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
 * every subprocess this project runs goes through it.
 *
 * **Timeout is a rejection, not a result field**: a non-zero exit is NOT a
 * rejection here, only a `ProcResult.exitCode !== 0`, but a timeout or missing
 * binary rejects the promise. This is what lets `Git`'s real adapter reproduce
 * "non-zero exit or any exception -> empty string" with one `try/catch` around
 * a single `await proc.run(...)`.
 */
export type Proc = {
  readonly run: (
    command: string,
    args: readonly string[],
    options: ProcRunOptions,
  ) => Promise<ProcResult>;
};
