import {
  SEARCH_DESCRIPTOR,
  NO_HITS_MESSAGE,
} from "@/cli/commands/search/search.constants.ts";
import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import {
  CLI_SUCCESS,
  cliFailure,
  flagValue,
  hasFlag,
  intFlag,
  requirePositional,
} from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import { expandPath, relativeTo } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { NoteService, SearchHitFormatter } from "@/modules/note/index.ts";
import { WorklogService } from "@/modules/worklog/index.ts";
import { ResolveWorkspaceUseCase } from "@/modules/workspace/index.ts";

export type SearchOptions = {
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};

@Command(SEARCH_DESCRIPTOR)
export class SearchCommand implements CommandContract<SearchOptions> {
  constructor(
    private readonly resolveWorkspace: ResolveWorkspaceUseCase,
    private readonly noteService: NoteService,
    private readonly worklogService: WorklogService,
    private readonly formatter: SearchHitFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<SearchOptions, ArgsError> {
    const query = requirePositional(tokens, "query");
    if (!query.ok) return { ok: false, error: { message: `search: ${query.error}` } };
    const rest = tokens.slice(1);
    const limit = intFlag(rest, "-k", 5);
    if (!limit.ok) return { ok: false, error: { message: limit.error } };
    return {
      ok: true,
      value: {
        query: query.value,
        workspace: flagValue(rest, "--workspace"),
        cwd: flagValue(rest, "--cwd"),
        limit: limit.value,
        worklog: hasFlag(rest, "--worklog"),
      },
    };
  }

  async run(options: SearchOptions, context: RunContext): Promise<CommandResult> {
    const cwd =
      options.cwd !== null ? expandPath(options.cwd, context.home) : context.cwd;
    const resolved = await this.resolveWorkspace.run(context.home, {
      cwd,
      explicitId: options.workspace,
    });
    if (!resolved.ok) return { lines: [], ...cliFailure(resolved.error) };
    const workspace = resolved.value;

    const searchOptions = { limit: options.limit, linkBoost: context.config.linkBoost };
    const hits = options.worklog
      ? await this.worklogService.search(workspace, options.query, searchOptions)
      : await this.noteService.search(workspace, options.query, searchOptions);

    if (hits.length === 0) return { lines: [NO_HITS_MESSAGE], ...CLI_SUCCESS };

    const lines = hits.flatMap((hit) => {
      const relativePath = relativeTo(hit.path, workspace.kb);
      return this.formatter.hit(hit.title, relativePath, hit.snippet);
    });
    return { lines, ...CLI_SUCCESS };
  }
}
