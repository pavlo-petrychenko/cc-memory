import type { Workspace } from "@/core/index.ts";
import type { FusedHit } from "@/core/index.ts";
import { NoteQuery } from "@/modules/note/projection/note.query.ts";

export type SearchNotesOptions = {
  readonly limit?: number;
  readonly linkBoost: number;
};

/** One user-facing operation: ranked search over the note index. */
export class SearchNotesUseCase {
  constructor(private readonly query: NoteQuery) {}

  run(
    workspace: Workspace,
    query: string,
    options: SearchNotesOptions,
  ): Promise<readonly FusedHit[]> {
    return this.query.searchFused(workspace, query, options);
  }
}
