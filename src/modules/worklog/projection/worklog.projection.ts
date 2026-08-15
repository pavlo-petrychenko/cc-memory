import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection, type IndexDocument, type SearchIndex } from "@/gateways/index.ts";

export type WorklogDocument = {
  readonly path: AbsPath;
  readonly slug: string;
  readonly date: string;
  readonly body: string;
  readonly mtimeMs: number;
};

function toIndexDocument(document: WorklogDocument): IndexDocument {
  return {
    path: document.path,
    title: "",
    body: document.body,
    tags: "",
    type: "",
    importance: null,
    relations: [],
    slug: document.slug,
    date: document.date,
    mtimeMs: document.mtimeMs,
  };
}

/** The write side of the worklog read model: project worklog files into the
 * `worklog_fts`/`worklog_files` tables and prune paths that left the worklogs. */
export class WorklogProjection {
  constructor(private readonly index: SearchIndex) {}

  resetIfStale(workspace: Workspace): Promise<boolean> {
    return this.index.resetIfStale(workspace);
  }

  project(workspace: Workspace, documents: readonly WorklogDocument[]): Promise<void> {
    return this.index.project(
      workspace,
      Collection.Worklog,
      documents.map(toIndexDocument),
    );
  }

  listExisting(workspace: Workspace): Promise<ReadonlyMap<string, number>> {
    return this.index.listExisting(workspace, Collection.Worklog);
  }

  prune(workspace: Workspace, keepPaths: ReadonlySet<string>): Promise<void> {
    return this.index.prune(workspace, Collection.Worklog, keepPaths);
  }
}
