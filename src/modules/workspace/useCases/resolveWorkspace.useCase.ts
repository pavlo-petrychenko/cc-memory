import { UseCase } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { ResolveFormatter } from "@/modules/workspace/commands/resolve/resolve.formatter.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";

export type ResolveWorkspaceInput = {
  readonly cwd: string | null;
};

/** One user-facing operation: resolve exactly one workspace for a cwd. No match
 * is a success (exit 0) with a message, unlike `search`/`notes`. */
export class ResolveWorkspaceUseCase extends UseCase<
  ResolveWorkspaceInput,
  Result<readonly string[], string>
> {
  private readonly repository = this.makeRepository(WorkspaceRepository);
  private readonly resolverService = this.makeService(WorkspaceResolverService);
  private readonly formatter = new ResolveFormatter();

  async execute(
    input: ResolveWorkspaceInput,
  ): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }

    const cwd =
      input.cwd !== null ? expandPath(input.cwd, home) : this.gateways.env.cwd();
    const workspace = this.resolverService.resolveWorkspace(
      registryResult.value,
      cwd,
      home,
    );
    if (workspace === null) {
      return { ok: true, value: [this.formatter.noWorkspaceForCwd(cwd)] };
    }

    const slug = await this.repository.worktreeSlug(cwd, workspace);
    return {
      ok: true,
      value: this.formatter.resolveLines(
        workspace.id,
        slug,
        workspace.kb,
        workspace.worklogs,
        workspace.indexDb,
      ),
    };
  }
}
