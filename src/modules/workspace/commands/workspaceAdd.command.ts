import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import {
  CLI_SUCCESS,
  cliFailure,
  flagValue,
  requirePositional,
  variadicValues,
} from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WORKSPACE_ADD_DESCRIPTOR } from "@/modules/workspace/commands/workspace/workspace.constants.ts";
import { WorkspaceFormatter } from "@/modules/workspace/commands/workspace/workspace.formatter.ts";
import { AddWorkspaceUseCase } from "@/modules/workspace/useCases/addWorkspace.useCase.ts";

export type WorkspaceAddOptions = {
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string | null;
  readonly worklogs: string | null;
  readonly exclude: readonly string[] | null;
};

@Command(WORKSPACE_ADD_DESCRIPTOR)
export class WorkspaceAddCommand implements CommandContract<WorkspaceAddOptions> {
  constructor(
    private readonly addWorkspace: AddWorkspaceUseCase,
    private readonly formatter: WorkspaceFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<WorkspaceAddOptions, ArgsError> {
    const id = requirePositional(tokens, "id");
    if (!id.ok) return { ok: false, error: { message: `workspace add: ${id.error}` } };
    const rest = tokens.slice(1);
    const match = variadicValues(rest, "--match");
    if (match === null || match.length === 0) {
      return {
        ok: false,
        error: { message: "workspace add: --match requires at least one path" },
      };
    }
    return {
      ok: true,
      value: {
        id: id.value,
        match,
        kb: flagValue(rest, "--kb"),
        worklogs: flagValue(rest, "--worklogs"),
        exclude: variadicValues(rest, "--exclude"),
      },
    };
  }

  async run(options: WorkspaceAddOptions, context: RunContext): Promise<CommandResult> {
    const result = await this.addWorkspace.run(context.home, options);
    if (!result.ok) return { lines: [], ...cliFailure(result.error) };

    const lines = this.formatter.workspaceAdded(
      result.value.id,
      result.value.kb,
      result.value.worklogs,
      result.value.indexDb,
      result.value.total,
      result.value.match,
    );
    return { lines, ...CLI_SUCCESS };
  }
}
