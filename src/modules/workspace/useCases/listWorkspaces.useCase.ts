import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WorkspaceLsFormatter } from "@/modules/workspace/commands/workspaceLs/workspaceLs.formatter.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import type { WorkspaceLsRow } from "@/modules/workspace/workspace.typedefs.ts";
import type { WorkspaceIndexBuilder } from "@/modules/workspace/workspace.typedefs.ts";

/** One user-facing operation: list registered workspaces with their note counts. */
export class ListWorkspacesUseCase {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly validatorService: WorkspaceValidatorService,
    private readonly indexBuilder: WorkspaceIndexBuilder,
    private readonly formatter: WorkspaceLsFormatter,
  ) {}

  async run(home: AbsPath): Promise<Result<readonly WorkspaceLsRow[], string>> {
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
    return { ok: true, value: rows };
  }
}
