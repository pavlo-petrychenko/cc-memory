import type { SearchArgs } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome, Config } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { NO_HITS_MESSAGE } from "@/retrieval/commands/search/search.constants.ts";
import { SearchFormatter } from "@/retrieval/commands/search/search.formatter.ts";
import { SearchKind, SearchService } from "@/retrieval/store/index.ts";
import { loadRegistryForCli, resolveWorkspaceForCwd } from "@/workspace/index.ts";

/** Every indexed path is always under `kb`, so this is prefix-stripping, not
 * full relpath resolution (`..` segments never occur in practice, same
 * reasoning as `store/noteList`'s `relativeToKb`, which this duplicates
 * rather than imports — it's private there). */
function relativeToKb(path: string, kb: string): string {
  const prefix = `${kb}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export class SearchCommand {
  constructor(
    private readonly searchService: SearchService = new SearchService(),
    private readonly formatter: SearchFormatter = new SearchFormatter(),
  ) {}

  async execute(
    container: Container,
    config: Config,
    args: SearchArgs,
  ): Promise<CliOutcome> {
    const home = container.env.home();
    const registryResult = await loadRegistryForCli(container.fs, home);
    if (!registryResult.ok) return registryResult.error;

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
    const resolved = resolveWorkspaceForCwd(
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
      const relativePath = relativeToKb(hit.path, workspace.kb);
      for (const line of this.formatter.hit(hit.title, relativePath, hit.snippet)) {
        container.stdio.write(line);
      }
    }
    return CLI_SUCCESS;
  }
}
