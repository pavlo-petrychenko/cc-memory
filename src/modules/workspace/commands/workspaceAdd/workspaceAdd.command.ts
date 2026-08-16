import { Command } from "@/core/index.ts";
import { flagValue, requirePositional, variadicValues } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { WORKSPACE_ADD_DESCRIPTOR } from "@/modules/workspace/commands/workspaceAdd/workspaceAdd.constants.ts";
import { AddWorkspaceUseCase } from "@/modules/workspace/useCases/addWorkspace.useCase.ts";

@Command({
  path: WORKSPACE_ADD_DESCRIPTOR.path,
  usage: WORKSPACE_ADD_DESCRIPTOR.usage,
  summary: WORKSPACE_ADD_DESCRIPTOR.summary,
  hidden: WORKSPACE_ADD_DESCRIPTOR.hidden,
  Handler: AddWorkspaceUseCase,
  mapOptions: (tokens): Result<AddWorkspaceInput, ArgsError> => {
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
  },
})
export class WorkspaceAddCommand {}

type AddWorkspaceInput = Parameters<AddWorkspaceUseCase["execute"]>[0];
