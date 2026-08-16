import type { AppContext } from "@/core/base/context.typedefs.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";

/** A real `WorkspaceRepository` over the container's filesystem, for tests that
 * seed a registry. */
export function makeWorkspaceRepository(ctx: AppContext): WorkspaceRepository {
  return new WorkspaceRepository(ctx);
}

/** A hook `WorkspaceResolver` over the container's own filesystem, via
 * `TargetResolutionService` (fail-open: load failure / no match → null). */
export function makeHookWorkspaceResolver(
  ctx: AppContext,
): (cwd: AbsPath) => Promise<Workspace | null> {
  const targetResolution = new TargetResolutionService(ctx);
  return (cwd) => targetResolution.resolveWorkspaceOrNull(ctx.gateways.env.home(), cwd);
}
