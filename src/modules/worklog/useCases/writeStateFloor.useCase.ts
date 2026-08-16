import { UseCase } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import { HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import { RECENT_COMMIT_COUNT } from "@/modules/worklog/hooks/worklogFloor/worklogFloor.constants.ts";
import { WorklogFloorFormatter } from "@/modules/worklog/index.ts";
import { WorklogStoreService } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

export type WriteStateFloorInput = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
  readonly reason: string;
};

function lastLineTrimmed(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return last === undefined ? "" : last.trim();
}

/** `SessionEnd`: append a deterministic git/command skeleton to today's journal. */
export class WriteStateFloorUseCase extends UseCase<WriteStateFloorInput, HookResult> {
  private readonly formatter = new WorklogFloorFormatter();
  private readonly worklogStoreService = this.makeService(WorklogStoreService);

  async execute(input: WriteStateFloorInput): Promise<HookResult> {
    const { workspace, cwd, reason } = input;
    const slug = worktreeSlug(
      (await this.gateways.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const date = this.gateways.clock.today();

    const branch = (
      await this.gateways.git.revParse(cwd, ["--abbrev-ref", "HEAD"])
    ).trim();
    const diffStat = (await this.gateways.git.diffStat(cwd, false)).trim();
    const stagedStat = (await this.gateways.git.diffStat(cwd, true)).trim();
    const recentCommits = (
      await this.gateways.git.logOneline(cwd, RECENT_COMMIT_COUNT)
    ).trim();

    const combinedStat = diffStat !== "" ? diffStat : stagedStat;
    const uncommitted = combinedStat === "" ? "" : lastLineTrimmed(combinedStat);

    const block = this.formatter.format({
      date,
      reason,
      branch,
      uncommitted,
      commits: recentCommits,
    });

    try {
      await this.worklogStoreService.appendToDated(workspace, slug, date, block);
    } catch {
      // best-effort write only.
    }
    return { kind: HookResultKind.Silent };
  }
}
