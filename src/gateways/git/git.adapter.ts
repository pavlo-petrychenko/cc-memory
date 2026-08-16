import type { AbsPath } from "@/core/index.ts";
import {
  READ_TIMEOUT_MS,
  SHOW_TOPLEVEL_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from "@/gateways/git/git.constants.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import type { Proc } from "@/gateways/proc/proc.typedefs.ts";

/** The real `Git`, implemented over `Proc` (never `child_process` directly) so
 * git interactions are assertable against `procFake.fake.ts`. */
export class GitAdapter implements Git {
  constructor(private readonly proc: Proc) {}

  /** Raw stdout on a clean exit, `""` on a non-zero exit or any thrown error. */
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

  /** Resolves `false` only on a timeout or spawn failure. */
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
