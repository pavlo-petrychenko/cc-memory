import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

/** Target resolution over a loaded registry: map a registry + id/cwd to the
 * workspace(s) a command should act on. */
export class TargetResolutionService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly validatorService: WorkspaceValidatorService,
    private readonly resolverService: WorkspaceResolverService,
  ) {}

  /** Loads the registry and resolves one-by-id or every registered workspace. */
  async resolveTarget(
    home: AbsPath,
    id: string | null,
  ): Promise<Result<readonly Workspace[], string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    return this.resolveTargetWorkspaces(registryResult.value, home, id);
  }

  noSuchWorkspaceMessage(id: string): string {
    return this.validatorService.noSuchWorkspaceMessage(id);
  }

  /** `id === null` means the positional `workspace` argument was omitted, and every
   * registered workspace is returned instead of a single one. */
  resolveTargetWorkspaces(
    raws: readonly RawWorkspace[],
    home: AbsPath,
    id: string | null,
  ): Result<readonly Workspace[], string> {
    if (id === null) {
      return {
        ok: true,
        value: raws.map((raw) => this.validatorService.expandWorkspace(raw, home)),
      };
    }
    const found = this.validatorService.findWorkspace(raws, id);
    if (found === null) return { ok: false, error: this.noSuchWorkspaceMessage(id) };
    return { ok: true, value: [this.validatorService.expandWorkspace(found, home)] };
  }

  /** An explicit `--workspace` id wins outright; otherwise falls back to
   * resolving `cwd` by longest-prefix match. */
  resolveWorkspaceForCwd(
    raws: readonly RawWorkspace[],
    home: AbsPath,
    cwd: AbsPath,
    explicitId: string | null,
  ): Result<Workspace, string> {
    if (explicitId !== null) {
      const found = this.validatorService.findWorkspace(raws, explicitId);
      if (found === null) {
        return { ok: false, error: this.noSuchWorkspaceMessage(explicitId) };
      }
      return { ok: true, value: this.validatorService.expandWorkspace(found, home) };
    }
    const resolved = this.resolverService.resolveWorkspace(raws, cwd, home);
    if (resolved === null) return { ok: false, error: NO_WORKSPACE_FOR_CWD_MESSAGE };
    return { ok: true, value: resolved };
  }
}
