import type { Proc, ProcResult, ProcRunOptions } from "@/platform/index.ts";

export type RecordedProcCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ProcRunOptions;
};

export type ScriptedProcResponse =
  | { readonly kind: "resolve"; readonly result: ProcResult }
  | { readonly kind: "reject"; readonly error: Error };

export type ProcFake = Proc & {
  readonly calls: readonly RecordedProcCall[];
  readonly enqueue: (response: ScriptedProcResponse) => void;
};

const DEFAULT_RESULT: ProcResult = { stdout: "", stderr: "", exitCode: 0 };

/** A `Proc` that records every call and returns pre-scripted responses instead of
 * spawning anything. */
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
