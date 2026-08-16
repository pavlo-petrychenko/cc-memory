import { Command } from "@/core/index.ts";
import { hasFlag } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { REINDEX_DESCRIPTOR } from "@/modules/memory/commands/reindexMemory.constants.ts";
import { ReindexMemoryUseCase } from "@/modules/memory/useCases/reindexMemory.useCase.ts";

@Command({
  path: REINDEX_DESCRIPTOR.path,
  usage: REINDEX_DESCRIPTOR.usage,
  summary: REINDEX_DESCRIPTOR.summary,
  hidden: REINDEX_DESCRIPTOR.hidden,
  Handler: ReindexMemoryUseCase,
  mapOptions: (tokens): Result<ReindexMemoryInput, ArgsError> => {
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
  },
})
export class ReindexCommand {}

type ReindexMemoryInput = Parameters<ReindexMemoryUseCase["execute"]>[0];
