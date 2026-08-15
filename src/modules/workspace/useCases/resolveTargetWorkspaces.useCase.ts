import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { TargetResolutionService } from "@/modules/workspace/resolution/workspace.target.service.ts";

/** One user-facing operation: resolve one-by-id or every registered workspace,
 * for `reindex`/`commit`. */
export class ResolveTargetWorkspacesUseCase {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly targetResolutionService: TargetResolutionService,
  ) {}

  async run(
    home: AbsPath,
    id: string | null,
  ): Promise<Result<readonly Workspace[], string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    return this.targetResolutionService.resolveTargetWorkspaces(
      registryResult.value,
      home,
      id,
    );
  }
}
