import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { TargetResolutionService } from "@/modules/workspace/resolution/workspace.target.service.ts";

export type ResolveWorkspaceInput = {
  readonly cwd: AbsPath;
  readonly explicitId: string | null;
};

/** One user-facing operation: resolve exactly one workspace for a cwd/--workspace. */
export class ResolveWorkspaceUseCase {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly targetResolutionService: TargetResolutionService,
  ) {}

  async run(
    home: AbsPath,
    input: ResolveWorkspaceInput,
  ): Promise<Result<Workspace, string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    return this.targetResolutionService.resolveWorkspaceForCwd(
      registryResult.value,
      home,
      input.cwd,
      input.explicitId,
    );
  }
}
