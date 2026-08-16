import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";

/** One user-facing operation: unregister a workspace, optionally purging its
 * derived index (never the vault data). */
export class RemoveWorkspaceUseCase {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly validatorService: WorkspaceValidatorService,
  ) {}

  async run(home: AbsPath, id: string, purge: boolean): Promise<Result<void, string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    const existing = registryResult.value;

    const target = existing.find((raw) => raw.id === id);
    if (target === undefined) {
      return { ok: false, error: this.validatorService.noSuchWorkspaceMessage(id) };
    }

    await this.repository.save(
      this.repository.defaultPath(home),
      existing.filter((raw) => raw.id !== id),
    );

    if (purge) {
      const expanded = this.validatorService.expandWorkspace(target, home);
      await this.repository.purgeIndex(expanded.indexDb);
    }
    return { ok: true, value: undefined };
  }
}
