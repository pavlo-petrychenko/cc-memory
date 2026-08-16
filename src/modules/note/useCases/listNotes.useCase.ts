import type { Workspace } from "@/core/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import type { NoteSummary } from "@/modules/note/note.typedefs.ts";

/** One user-facing operation: enumerate the vault's notes. */
export class ListNotesUseCase {
  constructor(private readonly repository: NoteRepository) {}

  run(workspace: Workspace, folder?: string): Promise<readonly NoteSummary[]> {
    return this.repository.list(workspace, folder);
  }
}
