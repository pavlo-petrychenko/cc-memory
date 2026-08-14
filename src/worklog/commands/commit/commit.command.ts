import type { CommitArgs } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { AbsPath, CliOutcome } from "@/core/index.ts";
import type { Env, FileSystem, Proc, Stdio } from "@/platform/index.ts";
import {
  DEFAULT_COMMIT_MESSAGE,
  GIT_TIMEOUT_MS,
} from "@/worklog/commands/commit/commit.constants.ts";
import { CommitFormatter } from "@/worklog/commands/commit/commit.formatter.ts";
import { loadRegistryForCli, resolveTargetWorkspaces } from "@/workspace/index.ts";

/** Manual, local-only snapshot; never pushes. Unlike `worklogStore.service.ts`'s
 * `commitWorklogs`, this stages the whole kb repo via `git add -A`, so it goes
 * straight through `Proc` rather than the narrower `Git.add`/`Git.commit` port
 * methods. */
export class CommitCommand {
  constructor(
    private readonly fs: FileSystem,
    private readonly proc: Proc,
    private readonly env: Env,
    private readonly stdio: Stdio,
    private readonly formatter: CommitFormatter = new CommitFormatter(),
  ) {}

  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  /** One workspace's commit step, run to completion before the next — `git add`
   * and `git commit` in the same repo must run sequentially. */
  private async commitOne(
    workspace: { readonly id: string; readonly kb: AbsPath },
    message: string,
  ): Promise<string> {
    // SAFETY: `.git` is a fixed literal segment appended to an already-absolute,
    // normalized `AbsPath`.
    const gitDirPath = `${workspace.kb}/.git` as AbsPath;
    if (!(await this.isGitRepoDir(gitDirPath))) {
      return this.formatter.commitSkipped(workspace.id);
    }
    await this.proc.run("git", ["-C", workspace.kb, "add", "-A"], {
      timeoutMs: GIT_TIMEOUT_MS,
    });
    const commitResult = await this.proc.run(
      "git",
      ["-C", workspace.kb, "commit", "-m", message],
      { timeoutMs: GIT_TIMEOUT_MS },
    );
    return this.formatter.commitResult(workspace.id, commitResult.exitCode === 0);
  }

  async execute(args: CommitArgs): Promise<CliOutcome> {
    const home = this.env.home();
    const registryResult = await loadRegistryForCli(this.fs, home);
    if (!registryResult.ok) return registryResult.error;

    const targets = resolveTargetWorkspaces(registryResult.value, home, args.workspace);
    if (!targets.ok) return cliFailure(targets.error);

    const message = args.message ?? DEFAULT_COMMIT_MESSAGE;
    for (const workspace of targets.value) {
      // Deliberately sequential (not `Promise.all`): two commits landing in the
      // same kb repo at once would race `git add -A`/`git commit`.
      // eslint-disable-next-line no-await-in-loop
      const line = await this.commitOne(workspace, message);
      this.stdio.write(line);
    }
    return CLI_SUCCESS;
  }
}
