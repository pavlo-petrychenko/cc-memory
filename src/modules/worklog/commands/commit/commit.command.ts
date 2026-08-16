import { Command } from "@/core/index.ts";
import { flagValue } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { COMMIT_DESCRIPTOR } from "@/modules/worklog/commands/commit/commit.constants.ts";
import { CommitWorklogUseCase } from "@/modules/worklog/useCases/commitWorklog.useCase.ts";

@Command({
  path: COMMIT_DESCRIPTOR.path,
  usage: COMMIT_DESCRIPTOR.usage,
  summary: COMMIT_DESCRIPTOR.summary,
  hidden: COMMIT_DESCRIPTOR.hidden,
  Handler: CommitWorklogUseCase,
  mapOptions: (tokens): Result<CommitWorklogInput, ArgsError> => {
    const first = tokens[0];
    const hasPositional = first !== undefined && !first.startsWith("-");
    const rest = hasPositional ? tokens.slice(1) : tokens;
    return {
      ok: true,
      value: {
        workspace: hasPositional ? (first ?? null) : null,
        message: flagValue(rest, "-m") ?? flagValue(rest, "--message"),
      },
    };
  },
})
export class CommitCommand {}

type CommitWorklogInput = Parameters<CommitWorklogUseCase["execute"]>[0];
