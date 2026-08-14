import type { Proc, ProcResult, ProcRunOptions } from "../../../src/ports/proc.port.ts";

/** One invocation of `Proc.run`, exactly as the fake recorded it, for
 * assertions like "git-cli passed the right argv/timeout". */
export type RecordedProcCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ProcRunOptions;
};

/** One scripted response: either a `ProcResult` to resolve with, or an `Error`
 * to reject with (simulating a timeout or a spawn failure). */
export type ScriptedProcResponse =
  | { readonly kind: "resolve"; readonly result: ProcResult }
  | { readonly kind: "reject"; readonly error: Error };

export type ProcFake = Proc & {
  readonly calls: readonly RecordedProcCall[];
  /** Queue one response per call, consumed in order (FIFO). A call made after
   * the queue is empty resolves with exit code 0 and empty output. */
  readonly enqueue: (response: ScriptedProcResponse) => void;
};

const DEFAULT_RESULT: ProcResult = { stdout: "", stderr: "", exitCode: 0 };

/** A `Proc` that records every call and returns pre-scripted responses instead
 * of spawning anything — what `gitCli.adapter.test.ts` scripts non-zero exits
 * and timeouts against. */
export function makeProcFake(): ProcFake {
  const calls: RecordedProcCall[] = [];
  const queue: ScriptedProcResponse[] = [];

  return {
    calls,
    enqueue: (response: ScriptedProcResponse) => {
      queue.push(response);
    },
    run: (command: string, args: readonly string[], options: ProcRunOptions) => {
      calls.push({ command, args, options });
      const next = queue.shift();
      if (next === undefined) return Promise.resolve(DEFAULT_RESULT);
      return next.kind === "resolve"
        ? Promise.resolve(next.result)
        : Promise.reject(next.error);
    },
  };
}
