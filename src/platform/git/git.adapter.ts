import type { AbsPath } from "@/core/index.ts";
import {
  READ_TIMEOUT_MS,
  SHOW_TOPLEVEL_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from "@/platform/git/git.constants.ts";
import type { Git } from "@/platform/git/git.typedefs.ts";
import type { Proc } from "@/platform/proc/proc.typedefs.ts";

/** The real `Git`, implemented over `Proc` (never `child_process` directly) so
 * git interactions are assertable against `procFake.fake.ts`. */
export class GitAdapter implements Git {
  constructor(private readonly proc: Proc) {}

  /**
   * Run `git -C cwd <...args>`, returning raw stdout on a clean exit or `""` on
   * a non-zero exit or any thrown error (timeout, missing binary). `Proc.run`
   * rejecting on timeout is what lets one `try/catch` cover both a timeout and
   * a spawn failure.
   */
  private async readGit(
    cwd: AbsPath,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<string> {
    try {
      const result = await this.proc.run("git", ["-C", cwd, ...args], { timeoutMs });
      return result.exitCode === 0 ? result.stdout : "";
    } catch {
      return "";
    }
  }

  /**
   * Run a git command whose exit code the caller doesn't inspect (`add`,
   * `commit`). Resolves `false` only on a timeout or spawn failure.
   */
  private async writeGit(cwd: AbsPath, args: readonly string[]): Promise<boolean> {
    try {
      await this.proc.run("git", ["-C", cwd, ...args], { timeoutMs: WRITE_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  statusPorcelain(cwd: AbsPath): Promise<string> {
    return this.readGit(cwd, ["status", "--porcelain"], READ_TIMEOUT_MS);
  }

  revParse(cwd: AbsPath, args: readonly string[]): Promise<string> {
    return this.readGit(cwd, ["rev-parse", ...args], READ_TIMEOUT_MS);
  }

  showToplevel(cwd: AbsPath): Promise<string> {
    return this.readGit(cwd, ["rev-parse", "--show-toplevel"], SHOW_TOPLEVEL_TIMEOUT_MS);
  }

  diffStat(cwd: AbsPath, staged: boolean): Promise<string> {
    return this.readGit(
      cwd,
      staged ? ["diff", "--cached", "--stat"] : ["diff", "--stat"],
      READ_TIMEOUT_MS,
    );
  }

  logOneline(cwd: AbsPath, count: number): Promise<string> {
    return this.readGit(cwd, ["log", `-${count}`, "--oneline"], READ_TIMEOUT_MS);
  }

  add(cwd: AbsPath, paths: readonly string[]): Promise<boolean> {
    return this.writeGit(cwd, ["add", "--", ...paths]);
  }

  commit(cwd: AbsPath, message: string): Promise<boolean> {
    return this.writeGit(cwd, ["commit", "-m", message]);
  }
}
