import type { AbsPath } from "../core/AbsPath.ts";
import type { Git } from "./git.port.ts";
import type { Proc } from "./proc.port.ts";

const SHOW_TOPLEVEL_TIMEOUT_MS = 3000;
const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 10_000;

/**
 * Run `git -C cwd <...args>`, returning raw stdout on a clean exit or `""` on a
 * non-zero exit or any thrown error (timeout, missing binary). `Proc.run`
 * rejecting on timeout is what lets one `try/catch` cover both a timeout and a
 * spawn failure.
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
 * Run a git command whose exit code the caller doesn't inspect (`add`,
 * `commit`). Resolves `false` only on a timeout or spawn failure.
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
