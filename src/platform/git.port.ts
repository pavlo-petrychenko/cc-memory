import type { AbsPath } from "../core/AbsPath.ts";

/**
 * Every git interaction the codebase performs, as an interface implemented over
 * `Proc` (`adapters/gitCli.adapter.ts`) rather than `child_process` directly, so
 * git calls are assertable against a scripted fake without a real repo.
 *
 * **Failure semantics are part of the contract, not an adapter detail**: every
 * read-only method here returns an EMPTY STRING on a non-zero exit or a thrown
 * exception (timeout, missing binary) rather than raising. Callers that need to
 * distinguish "clean exit, no output" from "git failed" cannot with this port.
 *
 * Trimming/formatting of the returned string is deliberately NOT done here —
 * adapters stay thin (no formatting, no defaults); that choice belongs to the
 * calling service, not this port.
 */
export type Git = {
  /** `git -C cwd status --porcelain`, 5s timeout. */
  readonly statusPorcelain: (cwd: AbsPath) => Promise<string>;
  /**
   * `git -C cwd rev-parse <...args>`, 5s timeout — covers both `rev-parse HEAD`
   * and `rev-parse --abbrev-ref HEAD`.
   */
  readonly revParse: (cwd: AbsPath, args: readonly string[]) => Promise<string>;
  /**
   * `git -C cwd rev-parse --show-toplevel` — split out from `revParse` because it
   * alone runs with a **3s** timeout, not 5s.
   */
  readonly showToplevel: (cwd: AbsPath) => Promise<string>;
  /** `git -C cwd diff [--cached] --stat`, 5s timeout. */
  readonly diffStat: (cwd: AbsPath, staged: boolean) => Promise<string>;
  /** `git -C cwd log -<count> --oneline`, 5s timeout. */
  readonly logOneline: (cwd: AbsPath, count: number) => Promise<string>;
  /**
   * `git -C cwd add -- <...paths>`, 10s timeout. Resolves `true` once the
   * process runs to completion, regardless of git's own exit code; resolves
   * `false` only on a timeout or spawn failure.
   */
  readonly add: (cwd: AbsPath, paths: readonly string[]) => Promise<boolean>;
  /** `git -C cwd commit -m <message>`, 10s timeout. Same "ran vs. failed to
   * run" semantics as `add` — a no-op commit (nothing staged) exits non-zero
   * and still resolves `true`. */
  readonly commit: (cwd: AbsPath, message: string) => Promise<boolean>;
};
