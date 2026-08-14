import type { AbsPath } from "../core/AbsPath.ts";
import type { Git } from "./git.port.ts";
import type { Proc } from "./proc.port.ts";

// Exact timeouts from the Python this replaces — never re-derive (CLAUDE.md).
const SHOW_TOPLEVEL_TIMEOUT_MS = 3000; // resolve.py:33
const READ_TIMEOUT_MS = 5000; // wrap-gate.py:30, worklog-floor.py:22
const WRITE_TIMEOUT_MS = 10_000; // worklog.py:109-113

/**
 * Run `git -C cwd <...args>`, returning raw stdout on a clean exit or `""` on a
 * non-zero exit or any thrown error (timeout, missing binary) — the exact
 * fail-to-empty-string semantics of every Python `_git` helper this replaces
 * (`wrap-gate.py:28-34`, `worklog-floor.py:19-25`). `Proc.run` rejecting on
 * timeout is what lets one `try/catch` cover both a `TimeoutExpired`-equivalent
 * and a spawn failure, matching Python's single `except Exception`.
 */
async function readGit(
  proc: Proc,
  cwd: AbsPath,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  try {
    const result = await proc.run("git", ["-C", cwd, ...args], { timeoutMs });
    return result.exitCode === 0 ? result.stdout : "";
  } catch {
    return "";
  }
}

/**
 * Run a git command whose exit code the caller doesn't inspect (`add`, `commit`
 * — `worklog.py:102-116`'s `git_commit_worklogs` never checks either
 * `subprocess.run`'s return code, only whether the call raised). Resolves
 * `false` only on a timeout or spawn failure.
 */
async function writeGit(
  proc: Proc,
  cwd: AbsPath,
  args: readonly string[],
): Promise<boolean> {
  try {
    await proc.run("git", ["-C", cwd, ...args], { timeoutMs: WRITE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** The real `Git`, implemented over `Proc` (never `child_process` directly) so
 * git interactions are assertable against `procFake.fake.ts`. */
export function makeGitCliAdapter(proc: Proc): Git {
  return {
    statusPorcelain: (cwd) =>
      readGit(proc, cwd, ["status", "--porcelain"], READ_TIMEOUT_MS),
    revParse: (cwd, args) => readGit(proc, cwd, ["rev-parse", ...args], READ_TIMEOUT_MS),
    showToplevel: (cwd) =>
      readGit(proc, cwd, ["rev-parse", "--show-toplevel"], SHOW_TOPLEVEL_TIMEOUT_MS),
    diffStat: (cwd, staged) =>
      readGit(
        proc,
        cwd,
        staged ? ["diff", "--cached", "--stat"] : ["diff", "--stat"],
        READ_TIMEOUT_MS,
      ),
    logOneline: (cwd, count) =>
      readGit(proc, cwd, ["log", `-${count}`, "--oneline"], READ_TIMEOUT_MS),
    add: (cwd, paths) => writeGit(proc, cwd, ["add", "--", ...paths]),
    commit: (cwd, message) => writeGit(proc, cwd, ["commit", "-m", message]),
  };
}
