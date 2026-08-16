import { Service } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { NoteProjection, NoteService } from "@/modules/note/index.ts";

/** The one capability the workspace commands need from the note index: reindex
 * and count. A Service so use cases compose it via `makeService`. */
export class WorkspaceIndexBuilderService extends Service {
  private readonly noteService = this.makeService(NoteService);
  private readonly noteProjection = this.makeProjection(NoteProjection);

  async buildIndex(workspace: Workspace): Promise<number> {
    return (await this.noteService.fullReindex(workspace)).total;
  }

  async noteCount(workspace: Workspace): Promise<number> {
    return (await this.noteProjection.listExisting(workspace)).size;
  }
}
