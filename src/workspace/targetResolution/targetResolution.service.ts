import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import { cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import type { RegistryService } from "@/workspace/services/registry/registry.service.ts";
import type { WorkspaceResolverService } from "@/workspace/services/resolver/resolver.service.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/workspace/targetResolution/targetResolution.constants.ts";

export function noSuchWorkspaceMessage(id: string): string {
  return `no such workspace: ${id}`;
}

export class TargetResolutionService {
  constructor(
    private readonly registryService: RegistryService,
    private readonly resolverService: WorkspaceResolverService,
  ) {}

  noSuchWorkspaceMessage(id: string): string {
    return noSuchWorkspaceMessage(id);
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
        value: raws.map((raw) => this.registryService.expandWorkspace(raw, home)),
      };
    }
    const found = this.registryService.find(raws, id);
    if (found === null) return { ok: false, error: this.noSuchWorkspaceMessage(id) };
    return { ok: true, value: [this.registryService.expandWorkspace(found, home)] };
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
      const found = this.registryService.find(raws, explicitId);
      if (found === null) {
        return { ok: false, error: this.noSuchWorkspaceMessage(explicitId) };
      }
      return { ok: true, value: this.registryService.expandWorkspace(found, home) };
    }
    const resolved = this.resolverService.resolveWorkspace(raws, cwd, home);
    if (resolved === null) return { ok: false, error: NO_WORKSPACE_FOR_CWD_MESSAGE };
    return { ok: true, value: resolved };
  }

  async loadRegistryForCli(
    home: AbsPath,
  ): Promise<Result<readonly RawWorkspace[], CliOutcome>> {
    const registryPath = this.registryService.defaultPath(home);
    const result = await this.registryService.load(registryPath);
    if (result.ok) return result;
    return { ok: false, error: cliFailure(`registry error: ${result.error.message}`) };
  }
}
