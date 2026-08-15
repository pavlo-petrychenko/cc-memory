import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { expandPath, relativeTo } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { NO_HITS_MESSAGE } from "@/retrieval/commands/search/search.constants.ts";
import { SearchFormatter } from "@/retrieval/commands/search/search.formatter.ts";
import type { SearchArgs } from "@/retrieval/commands/search/search.typedefs.ts";
import { SearchKind } from "@/retrieval/retrieval.typedefs.ts";
import { SearchService } from "@/retrieval/store/search/search.service.ts";
import {
  RegistryService,
  RegistryTomlSerializer,
  TargetResolutionService,
  WorkspaceResolverService,
} from "@/workspace/index.ts";

export class SearchCommand {
  constructor(
    private readonly searchService: SearchService,
    private readonly formatter: SearchFormatter,
  ) {}

  async execute(
    container: Container,
    config: Config,
    args: SearchArgs,
  ): Promise<CliOutcome> {
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

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
    const resolved = targetResolutionService.resolveWorkspaceForCwd(
      registryResult.value,
      home,
      cwd,
      args.workspace,
    );
    if (!resolved.ok) return cliFailure(resolved.error);
    const workspace = resolved.value;

    const hits = await this.searchService.searchFused(container, workspace, args.query, {
      limit: args.limit,
      kind: args.worklog ? SearchKind.Worklog : SearchKind.Notes,
      linkBoost: config.linkBoost,
    });

    if (hits.length === 0) {
      container.stdio.write(NO_HITS_MESSAGE);
      return CLI_SUCCESS;
    }
    for (const hit of hits) {
      const relativePath = relativeTo(hit.path, workspace.kb);
      for (const line of this.formatter.hit(hit.title, relativePath, hit.snippet)) {
        container.stdio.write(line);
      }
    }
    return CLI_SUCCESS;
  }
}
