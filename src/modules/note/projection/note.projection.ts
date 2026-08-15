import type { Workspace } from "@/core/index.ts";
import { Collection, type IndexDocument, type SearchIndex } from "@/gateways/index.ts";

/** The write side of the note read model: project `IndexDocument`s into the
 * `notes`/`notes_fts`/`links` tables and prune paths that left the vault. */
export class NoteProjection {
  constructor(private readonly index: SearchIndex) {}

  resetIfStale(workspace: Workspace): Promise<boolean> {
    return this.index.resetIfStale(workspace);
  }

  project(workspace: Workspace, documents: readonly IndexDocument[]): Promise<void> {
    return this.index.project(workspace, Collection.Notes, documents);
  }

  prune(workspace: Workspace, keepPaths: ReadonlySet<string>): Promise<void> {
    return this.index.prune(workspace, Collection.Notes, keepPaths);
  }
}
