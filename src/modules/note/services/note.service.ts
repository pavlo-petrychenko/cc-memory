import type { FusedHit } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import type { BuildStats } from "@/modules/note/note.typedefs.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";
import type { NoteDocument } from "@/modules/note/projection/note.projection.ts";
import { NoteQuery } from "@/modules/note/projection/note.query.ts";

export type SearchNotesOptions = {
  readonly limit?: number;
  readonly linkBoost: number;
};

const MTIME_EPSILON = 1e-6;

/** Note-domain operations: ranked search and (re)projection of the note vault
 * into the derived index. */
export class NoteService {
  constructor(
    private readonly repository: NoteRepository,
    private readonly projection: NoteProjection,
    private readonly query: NoteQuery,
  ) {}

  search(
    workspace: Workspace,
    query: string,
    options: SearchNotesOptions,
  ): Promise<readonly FusedHit[]> {
    return this.query.searchFused(workspace, query, options);
  }

  incrementalReindex(workspace: Workspace): Promise<BuildStats> {
    return this.reindex(workspace, true);
  }

  fullReindex(workspace: Workspace): Promise<BuildStats> {
    return this.reindex(workspace, false);
  }

  /** Incremental by mtime unless a schema bump or a full pass forces a full run. */
  private async reindex(workspace: Workspace, incremental: boolean): Promise<BuildStats> {
    const forced = await this.projection.resetIfStale(workspace);
    const effectiveIncremental = incremental && !forced;
    const existing = await this.projection.listExisting(workspace);
    const files = await this.repository.scanFiles(workspace);
    const seen = new Set<string>(files.map((file) => file.path));

    const results = await Promise.all(
      files.map(async (file) => {
        const existingMtime = existing.get(file.path);
        const unchanged =
          effectiveIncremental &&
          existingMtime !== undefined &&
          Math.abs(existingMtime - file.mtimeMs) < MTIME_EPSILON;
        if (unchanged) return null;
        const note = await this.repository.readNote(workspace, file.path);
        if (note === null) return null;
        return {
          document: { note, mtimeMs: file.mtimeMs },
          added: existingMtime === undefined,
        };
      }),
    );

    const documents: NoteDocument[] = [];
    let added = 0;
    let updated = 0;
    for (const result of results) {
      if (result === null) continue;
      documents.push(result.document);
      if (result.added) added += 1;
      else updated += 1;
    }
    const removed = [...existing.keys()].filter((path) => !seen.has(path)).length;

    await this.projection.project(workspace, documents);
    await this.projection.prune(workspace, seen);

    return { added, updated, removed, total: files.length };
  }
}
