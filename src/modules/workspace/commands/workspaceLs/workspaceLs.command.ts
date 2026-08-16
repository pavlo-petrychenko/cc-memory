import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { WORKSPACE_LS_DESCRIPTOR } from "@/modules/workspace/commands/workspaceLs/workspaceLs.constants.ts";
import { ListWorkspacesUseCase } from "@/modules/workspace/useCases/listWorkspaces.useCase.ts";

@Command({
  path: WORKSPACE_LS_DESCRIPTOR.path,
  usage: WORKSPACE_LS_DESCRIPTOR.usage,
  summary: WORKSPACE_LS_DESCRIPTOR.summary,
  hidden: WORKSPACE_LS_DESCRIPTOR.hidden,
  Handler: ListWorkspacesUseCase,
  mapOptions: (_tokens): Result<Record<string, never>, ArgsError> => {
    return { ok: true, value: {} };
  },
})
export class WorkspaceLsCommand {}
