import { Service } from "@/core/index.ts";
import type { FusedHit } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { WorklogProjection } from "@/modules/worklog/projection/worklog.projection.ts";
import type { WorklogDocument } from "@/modules/worklog/projection/worklog.projection.ts";
import { WorklogQuery } from "@/modules/worklog/projection/worklog.query.ts";
import { WorklogStoreService } from "@/modules/worklog/worklog.repository.ts";

export type SearchWorklogOptions = {
  readonly limit?: number;
  readonly linkBoost: number;
};

const MTIME_EPSILON = 1e-6;

/** Worklog-domain operations: ranked search and (re)projection of the worklog
 * journals into the derived index. */
export class WorklogService extends Service {
  private readonly store = this.makeService(WorklogStoreService);
  private readonly projection = this.makeProjection(WorklogProjection);
  private readonly query = this.makeProjection(WorklogQuery);

  search(
    workspace: Workspace,
    query: string,
    options: SearchWorklogOptions,
  ): Promise<readonly FusedHit[]> {
    return this.query.searchFused(workspace, query, options);
  }

  /** Incremental by mtime. */
  async reindex(workspace: Workspace): Promise<void> {
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
