import { Command, flagValue, hasFlag } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { NOTES_DESCRIPTOR } from "@/modules/memory/commands/notes.constants.ts";
import { ListNotesUseCase } from "@/modules/memory/useCases/listNotes.useCase.ts";

@Command({
  path: NOTES_DESCRIPTOR.path,
  usage: NOTES_DESCRIPTOR.usage,
  summary: NOTES_DESCRIPTOR.summary,
  hidden: NOTES_DESCRIPTOR.hidden,
  Handler: ListNotesUseCase,
  mapOptions: (tokens): Result<ListNotesInput, ArgsError> => {
    return {
      ok: true,
      value: {
        cwd: flagValue(tokens, "--cwd"),
        explicitId: flagValue(tokens, "--workspace"),
        folder: flagValue(tokens, "--folder"),
        json: hasFlag(tokens, "--json"),
      },
    };
  },
})
export class NotesCommand {}

type ListNotesInput = Parameters<ListNotesUseCase["execute"]>[0];
