import type { FileSystem, Git } from "@/gateways/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import type { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";

/** A real `WorkspaceRepository` over the supplied filesystem (and a fake git by
 * default), for tests that seed a registry without reaching for the full context. */
export function makeWorkspaceRepository(
  fs: FileSystem,
  git: Git = makeGitFake(),
): WorkspaceRepository {
  return makeWorkspaceContext(fs, git).repository;
}
