import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { VERSION_DESCRIPTOR } from "@/modules/meta/commands/help.constants.ts";
import { VersionUseCase } from "@/modules/meta/useCases/version.useCase.ts";

@Command({
  path: VERSION_DESCRIPTOR.path,
  usage: VERSION_DESCRIPTOR.usage,
  summary: VERSION_DESCRIPTOR.summary,
  hidden: VERSION_DESCRIPTOR.hidden,
  Handler: VersionUseCase,
  mapOptions: (_tokens): Result<Record<string, never>, ArgsError> => {
    return { ok: true, value: {} };
  },
})
export class VersionCommand {}
