import type { AbsPath } from "@/core/index.ts";

export type ProcResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/** `env` is additive to the process environment, not a full replacement. */
export type ProcRunOptions = {
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly cwd?: AbsPath;
  readonly env?: Readonly<Record<string, string>>;
};

/** The sole seam between the codebase and `child_process`/`Bun.spawn`. Timeout is a
 * rejection, not a result field: a non-zero exit is only `exitCode !== 0`, but a
 * timeout or missing binary rejects the promise. */
export type Proc = {
  readonly run: (
    command: string,
    args: readonly string[],
    options: ProcRunOptions,
  ) => Promise<ProcResult>;
};
