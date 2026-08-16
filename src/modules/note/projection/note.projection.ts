import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Projection } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection, type IndexDocument, type SearchIndex } from "@/gateways/index.ts";
import type { Note } from "@/modules/note/note.entity.ts";

export type NoteDocument = {
  readonly note: Note;
  readonly mtimeMs: number;
};

function toIndexDocument(document: NoteDocument): IndexDocument {
  return {
    path: document.note.path,
    title: document.note.title,
    body: document.note.body,
    tags: document.note.tags,
    type: document.note.type,
    importance: document.note.importance,
    relations: document.note.rels.map((relation) => ({
      relType: relation.relationType,
      dst: relation.target,
    })),
    slug: "",
    date: "",
    mtimeMs: document.mtimeMs,
  };
}

/** The write side of the note read model: project `Note`s into the
 * `notes`/`notes_fts`/`links` tables and prune paths that left the vault. */
export class NoteProjection extends Projection {
  private readonly index: SearchIndex;

  constructor(ctx: AppContext) {
    super(ctx);
    this.index = ctx.searchIndex;
  }

  resetIfStale(workspace: Workspace): Promise<boolean> {
    return this.index.resetIfStale(workspace);
  }

  project(workspace: Workspace, documents: readonly NoteDocument[]): Promise<void> {
    return this.index.project(
      workspace,
      Collection.Notes,
      documents.map(toIndexDocument),
    );
  }

  listExisting(workspace: Workspace): Promise<ReadonlyMap<string, number>> {
    return this.index.listExisting(workspace, Collection.Notes);
  }

  prune(workspace: Workspace, keepPaths: ReadonlySet<string>): Promise<void> {
    return this.index.prune(workspace, Collection.Notes, keepPaths);
  }
}
