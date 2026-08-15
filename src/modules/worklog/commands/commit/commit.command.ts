import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { AbsPath, CliOutcome } from "@/core/index.ts";
import { joinAbs } from "@/core/index.ts";
import type { Env, FileSystem, Git, Proc, Stdio } from "@/gateways/index.ts";
import {
  DEFAULT_COMMIT_MESSAGE,
  GIT_TIMEOUT_MS,
} from "@/modules/worklog/commands/commit/commit.constants.ts";
import { CommitFormatter } from "@/modules/worklog/commands/commit/commit.formatter.ts";
import type { CommitArgs } from "@/modules/worklog/commands/commit/commit.typedefs.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

/** Manual, local-only snapshot; never pushes. Stages the whole kb repo via
 * `git add -A`, straight through `Proc` rather than `Git.add`/`Git.commit`. */
export class CommitCommand {
  constructor(
    private readonly fs: FileSystem,
    private readonly proc: Proc,
    private readonly env: Env,
    private readonly stdio: Stdio,
    private readonly git: Git,
    private readonly formatter: CommitFormatter,
  ) {}

  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  private async commitOne(
    workspace: { readonly id: string; readonly kb: AbsPath },
    message: string,
  ): Promise<string> {
    const gitDirPath = joinAbs(workspace.kb, ".git");
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
    const { repository, targetResolutionService } = makeWorkspaceContext(
      this.fs,
      this.git,
    );
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      return cliFailure(`registry error: ${registryResult.error.message}`);
    }

    const targets = targetResolutionService.resolveTargetWorkspaces(
      registryResult.value,
      home,
      args.workspace,
    );
    if (!targets.ok) return cliFailure(targets.error);

    const message = args.message ?? DEFAULT_COMMIT_MESSAGE;
    for (const workspace of targets.value) {
      // Deliberately sequential: two commits in the same kb repo at once would race.
      // eslint-disable-next-line no-await-in-loop
      const line = await this.commitOne(workspace, message);
      this.stdio.write(line);
    }
    return CLI_SUCCESS;
  }
}
