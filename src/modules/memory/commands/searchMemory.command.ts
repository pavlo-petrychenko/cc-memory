import { Command } from "@/core/index.ts";
import { flagValue, hasFlag, intFlag, requirePositional } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { SEARCH_DESCRIPTOR } from "@/modules/memory/commands/searchMemory.constants.ts";
import { SearchMemoryUseCase } from "@/modules/memory/useCases/searchMemory.useCase.ts";

@Command({
  path: SEARCH_DESCRIPTOR.path,
  usage: SEARCH_DESCRIPTOR.usage,
  summary: SEARCH_DESCRIPTOR.summary,
  hidden: SEARCH_DESCRIPTOR.hidden,
  Handler: SearchMemoryUseCase,
  mapOptions: (tokens): Result<SearchMemoryInput, ArgsError> => {
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
  },
})
export class SearchCommand {}

type SearchMemoryInput = Parameters<SearchMemoryUseCase["execute"]>[0];
