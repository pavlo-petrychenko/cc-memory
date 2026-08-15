import { relativeTo, stripChars } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import type { NoteSummary } from "@/retrieval/store/noteList/noteList.typedefs.ts";

export class NoteListService {
  constructor(private readonly connectionService: IndexConnectionService) {}

  /** Exhaustive, unlike `store/search/`'s recall-limited BM25 queries. */
  async list(
    container: Gateways,
    workspace: Workspace,
    folder?: string,
  ): Promise<readonly NoteSummary[]> {
    const { db } = await this.connectionService.open(container, workspace);
    const rows = db.query<{
      readonly path: string;
      readonly title: string;
      readonly type: string;
      readonly importance: number | null;
    }>("SELECT path, title, type, importance FROM notes ORDER BY path", []);

    const prefix =
      folder !== undefined && folder !== "" ? stripChars(folder, "/") : undefined;
    const results: NoteSummary[] = [];
    for (const row of rows) {
      const relativePath = relativeTo(row.path, workspace.kb);
      if (
        prefix !== undefined &&
        relativePath !== prefix &&
        !relativePath.startsWith(`${prefix}/`)
      ) {
        continue;
      }
      results.push({
        path: relativePath,
        title: row.title,
        type: row.type,
        importance: row.importance,
      });
    }
    return results;
  }
}
