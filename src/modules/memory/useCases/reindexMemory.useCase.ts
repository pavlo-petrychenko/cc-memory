import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { ReindexFormatter } from "@/modules/memory/commands/reindexMemory.formatter.ts";
import { NoteService } from "@/modules/note/index.ts";
import { WorklogService } from "@/modules/worklog/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";

export type ReindexMemoryInput = {
  readonly workspace: string | null;
  readonly full: boolean;
};

/** One user-facing operation: reindex note + worklog vaults for the target
 * workspace(s). */
export class ReindexMemoryUseCase extends UseCase<
  ReindexMemoryInput,
  Result<readonly string[], string>
> {
  private readonly targetResolution = this.makeService(TargetResolutionService);
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly formatter = new ReindexFormatter();

  async execute(input: ReindexMemoryInput): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const resolved = await this.targetResolution.resolveTarget(home, input.workspace);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const lines = await Promise.all(
      resolved.value.map(async (workspace) => {
        const stats = input.full
          ? await this.noteService.fullReindex(workspace)
          : await this.noteService.incrementalReindex(workspace);
        await this.worklogService.reindex(workspace);
        return this.formatter.line(
          workspace.id,
          stats.added,
          stats.updated,
          stats.removed,
          stats.total,
        );
      }),
    );
    return { ok: true, value: lines };
  }
}
