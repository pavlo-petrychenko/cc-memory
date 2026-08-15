import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import type { Proc } from "@/gateways/proc/proc.typedefs.ts";
import { WorkspaceParser } from "@/modules/workspace/workspace.parser.ts";
import { WorkspaceRepository } from "@/modules/workspace/workspace.repository.ts";
import { WorkspaceResolverService } from "@/modules/workspace/workspace.resolver.service.ts";
import { WorkspaceSerializer } from "@/modules/workspace/workspace.serializer.ts";
import { TargetResolutionService } from "@/modules/workspace/workspace.target.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/workspace.validator.service.ts";

export type WorkspaceContext = {
  readonly repository: WorkspaceRepository;
  readonly validatorService: WorkspaceValidatorService;
  readonly resolverService: WorkspaceResolverService;
  readonly targetResolutionService: TargetResolutionService;
};

/** The workspace composition graph: pure services first, then the repository and
 * target resolver over them. Built once by `cli`/`session` wiring. */
export function makeWorkspaceContext(
  fs: FileSystem,
  git: Git,
  proc: Proc,
): WorkspaceContext {
  const validatorService = new WorkspaceValidatorService();
  const resolverService = new WorkspaceResolverService(validatorService);
  const repository = new WorkspaceRepository(
    fs,
    git,
    proc,
    new WorkspaceParser(),
    new WorkspaceSerializer(),
    resolverService,
  );
  const targetResolutionService = new TargetResolutionService(
    validatorService,
    resolverService,
  );
  return { repository, validatorService, resolverService, targetResolutionService };
}
