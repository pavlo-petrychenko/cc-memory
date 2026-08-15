import type { Workspace } from "@/core/index.ts";
import { WorklogProjection } from "@/modules/worklog/projection/worklog.projection.ts";
import type { WorklogDocument } from "@/modules/worklog/projection/worklog.projection.ts";
import { WorklogStoreService } from "@/modules/worklog/worklog.repository.ts";

const MTIME_EPSILON = 1e-6;

/** One user-facing operation: (re)project the worklogs into the derived index,
 * incrementally by mtime. */
export class ReprojectWorklogUseCase {
  constructor(
    private readonly store: WorklogStoreService,
    private readonly projection: WorklogProjection,
  ) {}

  async run(workspace: Workspace): Promise<void> {
    await this.projection.resetIfStale(workspace);
    const existing = await this.projection.listExisting(workspace);
    const files = await this.store.scanWorklogFiles(workspace);
    const seen = new Set<string>(files.map((file) => file.path));

    const results = await Promise.all(
      files.map(async (file): Promise<WorklogDocument | null> => {
        const existingMtime = existing.get(file.path);
        const unchanged =
          existingMtime !== undefined &&
          Math.abs(existingMtime - file.mtimeMs) < MTIME_EPSILON;
        if (unchanged) return null;
        try {
          return {
            path: file.path,
            slug: file.slug,
            date: file.date,
            body: await this.store.readWorklogFile(file.path),
            mtimeMs: file.mtimeMs,
          };
        } catch {
          // an unreadable worklog file is skipped, not fatal.
          return null;
        }
      }),
    );
    const documents = results.filter(
      (document): document is WorklogDocument => document !== null,
    );

    await this.projection.project(workspace, documents);
    await this.projection.prune(workspace, seen);
  }
}
