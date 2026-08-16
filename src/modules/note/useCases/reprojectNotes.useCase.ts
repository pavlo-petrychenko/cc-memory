import type { Workspace } from "@/core/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import type { BuildStats } from "@/modules/note/note.typedefs.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";
import type { NoteDocument } from "@/modules/note/projection/note.projection.ts";

export type ReprojectNotesOptions = { readonly incremental: boolean };

const MTIME_EPSILON = 1e-6;

/** One user-facing operation: (re)project the note vault into the derived index,
 * incrementally by mtime unless a schema bump or `--full` forces a full pass. */
export class ReprojectNotesUseCase {
  constructor(
    private readonly repository: NoteRepository,
    private readonly projection: NoteProjection,
  ) {}

  async run(workspace: Workspace, options: ReprojectNotesOptions): Promise<BuildStats> {
    const forced = await this.projection.resetIfStale(workspace);
    const incremental = options.incremental && !forced;
    const existing = await this.projection.listExisting(workspace);
    const files = await this.repository.scanFiles(workspace);
    const seen = new Set<string>(files.map((file) => file.path));

    const results = await Promise.all(
      files.map(async (file) => {
        const existingMtime = existing.get(file.path);
        const unchanged =
          incremental &&
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
