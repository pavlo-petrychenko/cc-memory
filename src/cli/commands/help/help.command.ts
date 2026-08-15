import {
  COMMAND_DESCRIPTORS,
  ENV_VAR_DESCRIPTORS,
  HELP_DESCRIPTOR,
  USAGE_HEADER,
} from "@/cli/commands/help/help.constants.ts";
import { HelpFormatter } from "@/cli/commands/help/help.formatter.ts";
import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";

export type HelpOptions = Record<string, never>;

@Command(HELP_DESCRIPTOR)
export class HelpCommand implements CommandContract<HelpOptions> {
  constructor(private readonly formatter: HelpFormatter) {}

  parse(_tokens: readonly string[]): Result<HelpOptions, ArgsError> {
    return { ok: true, value: {} };
  }

  run(_options: HelpOptions, _context: RunContext): Promise<CommandResult> {
    return Promise.resolve({
      lines: [
        this.formatter.render(USAGE_HEADER, COMMAND_DESCRIPTORS, ENV_VAR_DESCRIPTORS),
      ],
      ...CLI_SUCCESS,
    });
  }
}
