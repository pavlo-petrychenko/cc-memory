import type { AbsPath, Workspace } from "@/core/index.ts";
import type { FileSystem, Gateways, Git, Proc } from "@/gateways/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import type { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";

/** A real `WorkspaceRepository` over the supplied filesystem (and fake git/proc by
 * default), for tests that seed a registry without reaching for the full context. */
export function makeWorkspaceRepository(
  fs: FileSystem,
  git: Git = makeGitFake(),
  proc: Proc = makeProcFake(),
): WorkspaceRepository {
  return makeWorkspaceContext(fs, git, proc).repository;
}

/** A hook `WorkspaceResolver` over the container's own filesystem: loads the
 * registry, logs a load failure (as the fail-open runtime did), and resolves or
 * returns null. Lets the per-hook tests exercise the same composition as
 * `HookDispatchCommand` without importing the workspace module directly. */
export function makeHookWorkspaceResolver(
  container: Gateways,
): (cwd: AbsPath) => Promise<Workspace | null> {
  const { repository, resolverService } = makeWorkspaceContext(
    container.fs,
    container.git,
    container.proc,
  );
  return async (cwd) => {
    const home = container.env.home();
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      container.logger.error(
        `hook: registry load failed (${registryResult.error.kind}): ${registryResult.error.message}`,
      );
      return null;
    }
    return resolverService.resolveWorkspace(registryResult.value, cwd, home);
  };
}
