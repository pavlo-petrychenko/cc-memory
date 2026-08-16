import { UseCase } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import { HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import { CompactCheckpointFormatter } from "@/modules/worklog/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import { WorklogStoreService } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

export type AppendCompactInput = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
  readonly compactSummary: string;
  readonly trigger: string;
};

/** `PostCompact`: persist the compaction summary into today's worklog journal. */
export class AppendCompactUseCase extends UseCase<AppendCompactInput, HookResult> {
  private readonly formatter = new CompactCheckpointFormatter();
  private readonly worklogStoreService = this.makeService(WorklogStoreService);

  async execute(input: AppendCompactInput): Promise<HookResult> {
    const summary = input.compactSummary.trim();
    if (summary === "") return { kind: HookResultKind.Silent };

    const { workspace, cwd, trigger } = input;
    const slug = worktreeSlug(
      (await this.gateways.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const date = this.gateways.clock.today();
    const block = this.formatter.formatCompactBlock({ trigger, summary });

    try {
      await this.worklogStoreService.appendToDated(workspace, slug, date, block);
    } catch {
      // best-effort write only.
    }
    return { kind: HookResultKind.Silent };
  }
}
