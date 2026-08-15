import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { ReindexFormatter } from "@/retrieval/commands/reindex/reindex.formatter.ts";
import type { ReindexArgs } from "@/retrieval/commands/reindex/reindex.typedefs.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import {
  RegistryService,
  RegistryTomlSerializer,
  TargetResolutionService,
  WorkspaceResolverService,
} from "@/workspace/index.ts";

export class ReindexCommand {
  constructor(
    private readonly indexBuildService: IndexBuildService,
    private readonly formatter: ReindexFormatter,
  ) {}

  /** One line per target workspace, printed in registry order (`Promise.all`
   * preserves that order in its result array even though the builds run
   * concurrently). */
  async execute(container: Container, args: ReindexArgs): Promise<CliOutcome> {
    const home = container.env.home();
    const registryService = new RegistryService(
      container.fs,
      new RegistryTomlSerializer(),
    );
    const resolverService = new WorkspaceResolverService(registryService, container.git);
    const targetResolutionService = new TargetResolutionService(
      registryService,
      resolverService,
    );
    const registryResult = await targetResolutionService.loadRegistryForCli(home);
    if (!registryResult.ok) return registryResult.error;

    const targets = targetResolutionService.resolveTargetWorkspaces(
      registryResult.value,
      home,
      args.workspace,
    );
    if (!targets.ok) return cliFailure(targets.error);

    const lines = await Promise.all(
      targets.value.map(async (workspace) => {
        const stats = await this.indexBuildService.build(container, workspace, {
          incremental: !args.full,
        });
        return this.formatter.line(
          workspace.id,
          stats.added,
          stats.updated,
          stats.removed,
          stats.total,
        );
      }),
    );
    for (const line of lines) container.stdio.write(line);
    return CLI_SUCCESS;
  }
}
