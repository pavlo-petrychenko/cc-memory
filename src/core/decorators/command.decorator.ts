import type {
  FormatterConstructor,
  UseCaseConstructor,
} from "@/core/base/constructor.typedefs.ts";
import type { AppContext } from "@/core/base/context.typedefs.ts";
import type { Result } from "@/core/core.typedefs.ts";
import { ARGS_PARSE_ERROR_EXIT_CODE } from "@/core/transport/cli/cli.constants.ts";
import type { ArgsError, CommandResult } from "@/core/transport/cli/cli.typedefs.ts";

/** A use-case result the CLI can render: one line, several lines, or nothing. */
export type Renderable = string | null | readonly string[];

export const COMMAND_METADATA = Symbol("command");

export interface CommandParams<Options, Output extends Renderable> {
  readonly path: readonly string[];
  readonly usage: readonly string[];
  readonly summary: string;
  readonly hidden: boolean;
  readonly Handler: UseCaseConstructor<Options, Output>;
  readonly mapOptions: (
    tokens: readonly string[],
    ctx: AppContext,
  ) => Result<Options, ArgsError>;
  readonly PostProcessing?: FormatterConstructor<Output>;
}

export type CommandClass = abstract new (...args: never[]) => object;

/** Attaches `params` to a command class under `COMMAND_METADATA` — the only
 * effect. Registration stays an explicit list in `registry.ts`; nothing runs at
 * import time. */
export function Command<Options, Output extends Renderable>(
  params: CommandParams<Options, Output>,
) {
  return function <T extends CommandClass>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    Object.defineProperty(target, COMMAND_METADATA, { value: params });
    return target;
  };
}

export interface CommandHandler {
  readonly path: readonly string[];
  readonly usage: readonly string[];
  readonly summary: string;
  readonly hidden: boolean;
  readonly invoke: (tokens: readonly string[]) => Promise<CommandResult>;
}

function isRenderableList(output: Renderable): output is readonly string[] {
  return Object.prototype.toString.call(output) === "[object Array]";
}

function toLines(output: Renderable): readonly string[] {
  if (output === null) return [];
  if (isRenderableList(output)) return output;
  return [output];
}

type DecoratedCommand = {
  readonly [COMMAND_METADATA]?: CommandParams<unknown, Renderable>;
};

export function registerCommands(
  commandClasses: readonly CommandClass[],
  ctx: AppContext,
): CommandHandler[] {
  return commandClasses.map((CmdClass) => {
    // SAFETY: `@Command` writes `COMMAND_METADATA` onto the class at decoration
    // time; the assertion only reads back the property it is known to have set.
    const params = (CmdClass as DecoratedCommand)[COMMAND_METADATA];
    if (params === undefined) {
      throw new Error(`${CmdClass.name} has no @Command decorator`);
    }
    const useCase = new params.Handler(ctx);
    return {
      path: params.path,
      usage: params.usage,
      summary: params.summary,
      hidden: params.hidden,
      invoke: async (tokens) => {
        const options = params.mapOptions(tokens, ctx);
        if (!options.ok) {
          return {
            lines: [],
            exitCode: ARGS_PARSE_ERROR_EXIT_CODE,
            stderrMessage: options.error.message,
          };
        }
        const output = await useCase.execute(options.value);
        const rendered = params.PostProcessing
          ? new params.PostProcessing().format(output)
          : output;
        return { lines: toLines(rendered), exitCode: 0, stderrMessage: null };
      },
    };
  });
}
