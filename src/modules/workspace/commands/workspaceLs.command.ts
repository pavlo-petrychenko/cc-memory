import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WORKSPACE_LS_DESCRIPTOR } from "@/modules/workspace/commands/workspace/workspace.constants.ts";
import { ListWorkspacesUseCase } from "@/modules/workspace/useCases/listWorkspaces.useCase.ts";
import { NO_WORKSPACES_MESSAGE } from "@/modules/workspace/workspace.constants.ts";

export type WorkspaceLsOptions = Record<string, never>;

@Command(WORKSPACE_LS_DESCRIPTOR)
export class WorkspaceLsCommand implements CommandContract<WorkspaceLsOptions> {
  constructor(private readonly listWorkspaces: ListWorkspacesUseCase) {}

  parse(_tokens: readonly string[]): Result<WorkspaceLsOptions, ArgsError> {
    return { ok: true, value: {} };
  }

  async run(_options: WorkspaceLsOptions, context: RunContext): Promise<CommandResult> {
    const result = await this.listWorkspaces.run(context.home);
    if (!result.ok) return { lines: [], ...cliFailure(result.error) };

    if (result.value.length === 0) {
      return { lines: [NO_WORKSPACES_MESSAGE], ...CLI_SUCCESS };
    }
    return {
      lines: result.value.flatMap((row) => [row.summaryLine, row.matchLine]),
      ...CLI_SUCCESS,
    };
  }
}
