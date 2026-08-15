import type { AbsPath } from "@/core/index.ts";
import { relKey } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { DEFAULT_NEIGHBORS_LIMIT } from "@/retrieval/store/graph/graph.constants.ts";

function basename(path: string): string {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
}

/** A wikilink `dst` may carry a `|display` label — strip it before resolving. */
function beforePipe(raw: string): string {
  const pipeIndex = raw.indexOf("|");
  return (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
}

export class LinkGraphService {
  constructor(private readonly connectionService: IndexConnectionService) {}

  async neighbors(
    container: Container,
    workspace: Workspace,
    path: AbsPath,
    limit: number = DEFAULT_NEIGHBORS_LIMIT,
  ): Promise<readonly string[]> {
    const { db } = await this.connectionService.open(container, workspace);
    const rows = db.query<{ readonly dst: string }>(
      "SELECT dst FROM links WHERE src_path=? LIMIT ?",
      [path, limit],
    );
    return rows.map((row) => row.dst);
  }

  /** Within a candidate set only, counts how many OTHER candidates link to each
   * one, feeding the RRF corroboration bonus. Returns an empty map for fewer than
   * 2 candidates — corroboration needs at least one other candidate. */
  async inlinkCounts(
    container: Container,
    workspace: Workspace,
    candidatePaths: readonly AbsPath[],
  ): Promise<ReadonlyMap<AbsPath, number>> {
    if (candidatePaths.length < 2) return new Map();

    const byRelKey = new Map<string, AbsPath>();
    const byBasename = new Map<string, AbsPath>();
    for (const path of candidatePaths) {
      const key = relKey(path, workspace.kb);
      byRelKey.set(key, path);
      byBasename.set(basename(key), path);
    }
    const candidateSet = new Set(candidatePaths);
    const inDegree = new Map<AbsPath, number>(candidatePaths.map((path) => [path, 0]));

    const { db } = await this.connectionService.open(container, workspace);
    const placeholders = candidatePaths.map(() => "?").join(",");
    const rows = db.query<{ readonly src_path: string; readonly dst: string }>(
      `SELECT src_path, dst FROM links WHERE src_path IN (${placeholders})`,
      [...candidatePaths],
    );
    for (const row of rows) {
      const dst = beforePipe(row.dst);
      const target = byRelKey.get(dst) ?? byBasename.get(basename(dst));
      if (target !== undefined && candidateSet.has(target) && target !== row.src_path) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }
    return inDegree;
  }
}
