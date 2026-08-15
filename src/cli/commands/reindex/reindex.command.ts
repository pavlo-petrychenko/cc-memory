import { REINDEX_DESCRIPTOR } from "@/cli/commands/reindex/reindex.constants.ts";
import { ReindexFormatter } from "@/cli/commands/reindex/reindex.formatter.ts";
import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure, hasFlag } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { ReprojectNotesUseCase } from "@/modules/note/index.ts";
import { ReprojectWorklogUseCase } from "@/modules/worklog/index.ts";
import { ResolveTargetWorkspacesUseCase } from "@/modules/workspace/index.ts";

export type ReindexOptions = {
  readonly workspace: string | null;
  readonly full: boolean;
};

@Command(REINDEX_DESCRIPTOR)
export class ReindexCommand implements CommandContract<ReindexOptions> {
  constructor(
    private readonly resolveTargetWorkspaces: ResolveTargetWorkspacesUseCase,
    private readonly reprojectNotes: ReprojectNotesUseCase,
    private readonly reprojectWorklog: ReprojectWorklogUseCase,
    private readonly formatter: ReindexFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<ReindexOptions, ArgsError> {
    const first = tokens[0];
    const hasPositional = first !== undefined && !first.startsWith("-");
    const rest = hasPositional ? tokens.slice(1) : tokens;
    return {
      ok: true,
      value: {
        workspace: hasPositional ? (first ?? null) : null,
        full: hasFlag(rest, "--full"),
      },
    };
  }

  async run(options: ReindexOptions, context: RunContext): Promise<CommandResult> {
    const resolved = await this.resolveTargetWorkspaces.run(
      context.home,
      options.workspace,
    );
    if (!resolved.ok) return { lines: [], ...cliFailure(resolved.error) };

    const lines = await Promise.all(
      resolved.value.map(async (workspace) => {
        const stats = await this.reprojectNotes.run(workspace, {
          incremental: !options.full,
        });
        await this.reprojectWorklog.run(workspace);
        return this.formatter.line(
          workspace.id,
          stats.added,
          stats.updated,
          stats.removed,
          stats.total,
        );
      }),
    );
    return { lines, ...CLI_SUCCESS };
  }
}
