import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

/** Target resolution over a loaded registry: map a registry + id/cwd to the
 * workspace(s) a command should act on. */
export class TargetResolutionService extends Service {
  private readonly repository = this.makeRepository(WorkspaceRepository);
  private readonly validatorService = this.makeService(WorkspaceValidatorService);
  private readonly resolverService = this.makeService(WorkspaceResolverService);

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

  /** Loads the registry and resolves exactly one workspace for a cwd/--workspace. */
  async resolveWorkspace(
    home: AbsPath,
    cwd: AbsPath,
    explicitId: string | null,
  ): Promise<Result<Workspace, string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    return this.resolveWorkspaceForCwd(registryResult.value, home, cwd, explicitId);
  }

  /** Loads the registry and resolves one workspace, or null when none matches
   * (the hook fail-open path: no workspace is silent, not an error). */
  async resolveWorkspaceOrNull(home: AbsPath, cwd: AbsPath): Promise<Workspace | null> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) return null;
    return this.resolverService.resolveWorkspace(registryResult.value, cwd, home);
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
