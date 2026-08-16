import { UseCase } from "@/core/index.ts";
import { joinAbs } from "@/core/index.ts";
import type { AbsPath, Result } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { DEFAULT_COMMIT_MESSAGE } from "@/modules/worklog/commands/commit/commit.constants.ts";
import { CommitFormatter } from "@/modules/worklog/commands/commit/commit.formatter.ts";
import { WorklogStoreService } from "@/modules/worklog/worklog.repository.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";

export type CommitWorklogInput = {
  readonly workspace: string | null;
  readonly message: string | null;
};

/** One user-facing operation: commit the kb repo for the target workspace(s). */
export class CommitWorklogUseCase extends UseCase<
  CommitWorklogInput,
  Result<readonly string[], string>
> {
  private readonly targetResolution = this.makeService(TargetResolutionService);
  private readonly store = this.makeService(WorklogStoreService);
  private readonly formatter = new CommitFormatter();

  async execute(input: CommitWorklogInput): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const resolved = await this.targetResolution.resolveTarget(home, input.workspace);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const message = input.message ?? DEFAULT_COMMIT_MESSAGE;
    const lines: string[] = [];
    for (const workspace of resolved.value) {
      // Deliberately sequential: two commits in the same kb repo at once would race.
      // eslint-disable-next-line no-await-in-loop
      lines.push(await this.commitOne(workspace, message));
    }
    return { ok: true, value: lines };
  }

  private async commitOne(workspace: Workspace, message: string): Promise<string> {
    const gitDirPath = joinAbs(workspace.kb, ".git");
    if (!(await this.isGitRepoDir(gitDirPath))) {
      return this.formatter.commitSkipped(workspace.id);
    }
    const committed = await this.store.commitWorklogs(workspace, message);
    return this.formatter.commitResult(workspace.id, committed);
  }

  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    try {
      return (await this.gateways.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }
}
