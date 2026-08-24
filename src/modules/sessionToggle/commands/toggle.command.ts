import { Command, flagValue } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { TOGGLE_DESCRIPTOR } from "@/modules/sessionToggle/sessionToggle.constants.ts";
import type { ToggleAction } from "@/modules/sessionToggle/useCases/toggleMemory.useCase.ts";
import { ToggleMemoryUseCase } from "@/modules/sessionToggle/useCases/toggleMemory.useCase.ts";

const ACTIONS: ReadonlySet<string> = new Set<string>(["on", "off", "status"]);

@Command({
  path: TOGGLE_DESCRIPTOR.path,
  usage: TOGGLE_DESCRIPTOR.usage,
  summary: TOGGLE_DESCRIPTOR.summary,
  hidden: TOGGLE_DESCRIPTOR.hidden,
  Handler: ToggleMemoryUseCase,
  mapOptions: (tokens): Result<ToggleMemoryInput, ArgsError> => {
    const explicitSessionId = flagValue(tokens, "--session");
    const words = positionals(tokens);
    if (words.length > 1) {
      return {
        ok: false,
        error: {
          message: `expected at most one action word, got: ${words.join(" ")}`,
        },
      };
    }
    const word = words[0];
    if (word === undefined) {
      return { ok: true, value: { action: "flip", explicitSessionId } };
    }
    if (!ACTIONS.has(word)) {
      return {
        ok: false,
        error: { message: `unknown action '${word}' (expected on|off|status)` },
      };
    }
    // SAFETY: ACTIONS.has(word) just verified `word` is one of the literals
    // the ToggleAction union admits.
    return {
      ok: true,
      value: { action: word as ToggleAction, explicitSessionId },
    };
  },
})
export class ToggleCommand {}

type ToggleMemoryInput = Parameters<ToggleMemoryUseCase["execute"]>[0];

/** Non-flag tokens, skipping the value that follows `--session`. */
function positionals(tokens: readonly string[]): readonly string[] {
  const words: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token === "--session") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    words.push(token);
  }
  return words;
}
