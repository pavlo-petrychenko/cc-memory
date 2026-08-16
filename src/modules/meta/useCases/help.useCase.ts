import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  COMMAND_DESCRIPTORS,
  ENV_VAR_DESCRIPTORS,
  USAGE_HEADER,
} from "@/modules/meta/commands/help.constants.ts";
import { HelpFormatter } from "@/modules/meta/commands/help.formatter.ts";

/** One user-facing operation: render the `--help` text. */
export class HelpUseCase extends UseCase<
  Record<string, never>,
  Result<readonly string[], string>
> {
  private readonly formatter = new HelpFormatter();

  async execute(
    _options: Record<string, never>,
  ): Promise<Result<readonly string[], string>> {
    return {
      ok: true,
      value: [
        this.formatter.render(USAGE_HEADER, COMMAND_DESCRIPTORS, ENV_VAR_DESCRIPTORS),
      ],
    };
  }
}
