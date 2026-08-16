import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WorkspaceRmFormatter } from "@/modules/workspace/commands/workspaceRm/workspaceRm.formatter.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";

export type RemoveWorkspaceInput = {
  readonly id: string;
  readonly purge: boolean;
};

/** One user-facing operation: unregister a workspace, optionally purging its
 * derived index (never the vault data). */
export class RemoveWorkspaceUseCase extends UseCase<
  RemoveWorkspaceInput,
  Result<readonly string[], string>
> {
  private readonly repository = this.makeRepository(WorkspaceRepository);
  private readonly validatorService = this.makeService(WorkspaceValidatorService);
  private readonly formatter = new WorkspaceRmFormatter();

  async execute(input: RemoveWorkspaceInput): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    const existing = registryResult.value;

    const target = existing.find((raw) => raw.id === input.id);
    if (target === undefined) {
      return {
        ok: false,
        error: this.validatorService.noSuchWorkspaceMessage(input.id),
      };
    }

    await this.repository.save(
      this.repository.defaultPath(home),
      existing.filter((raw) => raw.id !== input.id),
    );

    if (input.purge) {
      const expanded = this.validatorService.expandWorkspace(target, home);
      await this.repository.purgeIndex(expanded.indexDb);
    }

    const line = input.purge
      ? this.formatter.workspaceRemovedPurged(input.id)
      : this.formatter.workspaceUnregistered(input.id);
    return { ok: true, value: [line] };
  }
}
