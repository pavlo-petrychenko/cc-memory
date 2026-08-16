import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { HELP_DESCRIPTOR } from "@/modules/meta/commands/help.constants.ts";
import { HelpUseCase } from "@/modules/meta/useCases/help.useCase.ts";

@Command({
  path: HELP_DESCRIPTOR.path,
  usage: HELP_DESCRIPTOR.usage,
  summary: HELP_DESCRIPTOR.summary,
  hidden: HELP_DESCRIPTOR.hidden,
  Handler: HelpUseCase,
  mapOptions: (_tokens): Result<Record<string, never>, ArgsError> => {
    return { ok: true, value: {} };
  },
})
export class HelpCommand {}
