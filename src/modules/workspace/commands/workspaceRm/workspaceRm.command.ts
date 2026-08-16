import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure, hasFlag, requirePositional } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WORKSPACE_RM_DESCRIPTOR } from "@/modules/workspace/commands/workspaceRm/workspaceRm.constants.ts";
import { WorkspaceRmFormatter } from "@/modules/workspace/commands/workspaceRm/workspaceRm.formatter.ts";
import { RemoveWorkspaceUseCase } from "@/modules/workspace/useCases/removeWorkspace.useCase.ts";

export type WorkspaceRmOptions = {
  readonly id: string;
  readonly purge: boolean;
};

@Command(WORKSPACE_RM_DESCRIPTOR)
export class WorkspaceRmCommand implements CommandContract<WorkspaceRmOptions> {
  constructor(
    private readonly removeWorkspace: RemoveWorkspaceUseCase,
    private readonly formatter: WorkspaceRmFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<WorkspaceRmOptions, ArgsError> {
    const id = requirePositional(tokens, "id");
    if (!id.ok) return { ok: false, error: { message: `workspace rm: ${id.error}` } };
    return {
      ok: true,
      value: { id: id.value, purge: hasFlag(tokens.slice(1), "--purge") },
    };
  }

  async run(options: WorkspaceRmOptions, context: RunContext): Promise<CommandResult> {
    const result = await this.removeWorkspace.run(
      context.home,
      options.id,
      options.purge,
    );
    if (!result.ok) return { lines: [], ...cliFailure(result.error) };

    const line = options.purge
      ? this.formatter.workspaceRemovedPurged(options.id)
      : this.formatter.workspaceUnregistered(options.id);
    return { lines: [line], ...CLI_SUCCESS };
  }
}
