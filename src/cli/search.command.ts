import { NO_HITS_MESSAGE } from "@/cli/search.constants.ts";
import type { SearchArgs } from "@/cli/search.typedefs.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { expandPath, relativeTo } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { SearchNotesUseCase } from "@/modules/note/index.ts";
import { SearchFormatter } from "@/modules/note/index.ts";
import { SearchWorklogUseCase } from "@/modules/worklog/index.ts";
import {
  RegistryService,
  RegistryTomlSerializer,
  TargetResolutionService,
  WorkspaceResolverService,
} from "@/modules/workspace/index.ts";

export class SearchCommand {
  constructor(
    private readonly searchNotes: SearchNotesUseCase,
    private readonly searchWorklog: SearchWorklogUseCase,
    private readonly formatter: SearchFormatter,
  ) {}

  async execute(
    container: Gateways,
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

    const options = { limit: args.limit, linkBoost: config.linkBoost };
    const hits = args.worklog
      ? await this.searchWorklog.run(workspace, args.query, options)
      : await this.searchNotes.run(workspace, args.query, options);

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
