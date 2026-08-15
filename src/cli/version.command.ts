import { VERSION_DESCRIPTOR } from "@/cli/help/help.constants.ts";
import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { CC_MEMORY_VERSION } from "@/version.ts";

export type VersionOptions = Record<string, never>;

@Command(VERSION_DESCRIPTOR)
export class VersionCommand implements CommandContract<VersionOptions> {
  parse(_tokens: readonly string[]): Result<VersionOptions, ArgsError> {
    return { ok: true, value: {} };
  }

  run(_options: VersionOptions, _context: RunContext): Promise<CommandResult> {
    return Promise.resolve({ lines: [`memory ${CC_MEMORY_VERSION}`], ...CLI_SUCCESS });
  }
}
