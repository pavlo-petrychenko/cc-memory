import type { AbsPath } from "@/core/index.ts";

/** Every read-only method here returns an EMPTY STRING on a non-zero exit or a
 * thrown exception rather than raising — a caller cannot distinguish "clean exit,
 * no output" from "git failed" with this port. Trimming/formatting is deliberately
 * not done here; that belongs to the calling service. */
export type Git = {
  /** `status --porcelain`, 5s timeout. */
  readonly statusPorcelain: (cwd: AbsPath) => Promise<string>;
  /** `rev-parse <...args>`, 5s timeout. */
  readonly revParse: (cwd: AbsPath, args: readonly string[]) => Promise<string>;
  /** `rev-parse --show-toplevel`, 3s timeout (not 5s). */
  readonly showToplevel: (cwd: AbsPath) => Promise<string>;
  /** `diff [--cached] --stat`, 5s timeout. */
  readonly diffStat: (cwd: AbsPath, staged: boolean) => Promise<string>;
  /** `log -<count> --oneline`, 5s timeout. */
  readonly logOneline: (cwd: AbsPath, count: number) => Promise<string>;
  /** `add -- <...paths>`, 10s timeout. `false` only on a timeout or spawn failure. */
  readonly add: (cwd: AbsPath, paths: readonly string[]) => Promise<boolean>;
  /** `commit -m <message>`, 10s timeout. Same semantics as `add` — a no-op commit
   * exits non-zero and still resolves `true`. */
  readonly commit: (cwd: AbsPath, message: string) => Promise<boolean>;
};
