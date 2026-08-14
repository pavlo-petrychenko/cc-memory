import type { AbsPath } from "../domain/AbsPath.ts";

/**
 * Every git interaction the codebase performs, as an interface implemented over
 * `Proc` (`adapters/gitCli.adapter.ts`) rather than `child_process` directly, so
 * git calls are assertable against a scripted fake without a real repo.
 *
 * **Failure semantics are part of the contract, not an adapter detail**: every
 * Python `_git` helper this replaces returns an EMPTY STRING on a non-zero exit
 * or a thrown exception (timeout, missing binary) rather than raising
 * (`wrap-gate.py:28-34`, `worklog-floor.py:19-25`). The real adapter reproduces
 * that for every read-only method here; callers that need to distinguish "clean
 * exit, no output" from "git failed" cannot with this port, matching the Python
 * this ports (it can't either).
 *
 * Trimming/formatting of the returned string is deliberately NOT done here —
 * adapters stay thin (no formatting, no defaults); the two Python call sites this
 * replaces disagree on whether to `.strip()` the result, so that choice belongs to
 * the calling service, not this port.
 */
export type Git = {
  /** `git -C cwd status --porcelain` (`wrap-gate.py:30-34`, 5s timeout). */
  readonly statusPorcelain: (cwd: AbsPath) => Promise<string>;
  /**
   * `git -C cwd rev-parse <...args>` (5s timeout) — covers both `rev-parse HEAD`
   * (`wrap-gate.py:62`) and `rev-parse --abbrev-ref HEAD` (`worklog-floor.py:41`).
   */
  readonly revParse: (cwd: AbsPath, args: readonly string[]) => Promise<string>;
  /**
   * `git -C cwd rev-parse --show-toplevel` — split out from `revParse` because it
   * alone runs with a **3s** timeout (`resolve.py:29-39`), not 5s.
   */
  readonly showToplevel: (cwd: AbsPath) => Promise<string>;
  /** `git -C cwd diff [--cached] --stat` (`worklog-floor.py:42-43`, 5s timeout). */
  readonly diffStat: (cwd: AbsPath, staged: boolean) => Promise<string>;
  /** `git -C cwd log -<count> --oneline` (`worklog-floor.py:44`, 5s timeout). */
  readonly logOneline: (cwd: AbsPath, count: number) => Promise<string>;
  /**
   * `git -C cwd add -- <...paths>` (`worklog.py:109-110`, 10s timeout). Resolves
   * `true` once the process runs to completion, regardless of git's own exit code
   * (the Python caller never inspects it — only a timeout/spawn failure turns the
   * surrounding `git_commit_worklogs` call into `False`); resolves `false` only on
   * a timeout or spawn failure.
   */
  readonly add: (cwd: AbsPath, paths: readonly string[]) => Promise<boolean>;
  /** `git -C cwd commit -m <message>` (`worklog.py:112-113`, 10s timeout). Same
   * "ran vs. failed to run" semantics as `add` — a no-op commit (nothing staged)
   * exits non-zero and still resolves `true` (`worklog.py:111`'s comment). */
  readonly commit: (cwd: AbsPath, message: string) => Promise<boolean>;
};
