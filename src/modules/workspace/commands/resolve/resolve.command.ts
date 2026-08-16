import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { RESOLVE_DESCRIPTOR } from "@/modules/workspace/commands/resolve/resolve.constants.ts";
import { ResolveWorkspaceUseCase } from "@/modules/workspace/useCases/resolveWorkspace.useCase.ts";

@Command({
  path: RESOLVE_DESCRIPTOR.path,
  usage: RESOLVE_DESCRIPTOR.usage,
  summary: RESOLVE_DESCRIPTOR.summary,
  hidden: RESOLVE_DESCRIPTOR.hidden,
  Handler: ResolveWorkspaceUseCase,
  mapOptions: (tokens): Result<ResolveWorkspaceInput, ArgsError> => {
    const first = tokens[0];
    return {
      ok: true,
      value: { cwd: first !== undefined && !first.startsWith("-") ? first : null },
    };
  },
})
export class ResolveCommand {}

type ResolveWorkspaceInput = Parameters<ResolveWorkspaceUseCase["execute"]>[0];
