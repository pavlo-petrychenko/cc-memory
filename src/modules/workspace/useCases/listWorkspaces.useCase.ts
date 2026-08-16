import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WorkspaceLsFormatter } from "@/modules/workspace/commands/workspaceLs/workspaceLs.formatter.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { WorkspaceIndexBuilderService } from "@/modules/workspace/services/workspaceIndexBuilder.service.ts";
import { NO_WORKSPACES_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

/** One user-facing operation: list registered workspaces with their note counts. */
export class ListWorkspacesUseCase extends UseCase<
  Record<string, never>,
  Result<readonly string[], string>
> {
  private readonly repository = this.makeRepository(WorkspaceRepository);
  private readonly validatorService = this.makeService(WorkspaceValidatorService);
  private readonly indexBuilder = this.makeService(WorkspaceIndexBuilderService);
  private readonly formatter = new WorkspaceLsFormatter();

  async execute(
    _options: Record<string, never>,
  ): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }

    const rows = await Promise.all(
      registryResult.value.map(async (raw) => {
        const ws = this.validatorService.expandWorkspace(raw, home);
        const noteCountText = (await this.repository.hasIndexFile(ws.indexDb))
          ? String(await this.indexBuilder.noteCount(ws))
          : "?";
        return {
          summaryLine: this.formatter.workspaceLsRow(raw.id, ws.kb, noteCountText),
          matchLine: this.formatter.workspaceLsMatch(ws.match),
        };
      }),
    );

    if (rows.length === 0) return { ok: true, value: [NO_WORKSPACES_MESSAGE] };
    return { ok: true, value: rows.flatMap((row) => [row.summaryLine, row.matchLine]) };
  }
}
