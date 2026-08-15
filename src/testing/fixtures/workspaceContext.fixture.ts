import type { FileSystem, Git, Proc } from "@/gateways/index.ts";
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
