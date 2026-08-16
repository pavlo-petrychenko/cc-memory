import { Command } from "@/core/index.ts";
import { hasFlag, requirePositional } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { WORKSPACE_RM_DESCRIPTOR } from "@/modules/workspace/commands/workspaceRm/workspaceRm.constants.ts";
import { RemoveWorkspaceUseCase } from "@/modules/workspace/useCases/removeWorkspace.useCase.ts";

@Command({
  path: WORKSPACE_RM_DESCRIPTOR.path,
  usage: WORKSPACE_RM_DESCRIPTOR.usage,
  summary: WORKSPACE_RM_DESCRIPTOR.summary,
  hidden: WORKSPACE_RM_DESCRIPTOR.hidden,
  Handler: RemoveWorkspaceUseCase,
  mapOptions: (tokens): Result<RemoveWorkspaceInput, ArgsError> => {
    const id = requirePositional(tokens, "id");
    if (!id.ok) return { ok: false, error: { message: `workspace rm: ${id.error}` } };
    return {
      ok: true,
      value: { id: id.value, purge: hasFlag(tokens.slice(1), "--purge") },
    };
  },
})
export class WorkspaceRmCommand {}

type RemoveWorkspaceInput = Parameters<RemoveWorkspaceUseCase["execute"]>[0];
