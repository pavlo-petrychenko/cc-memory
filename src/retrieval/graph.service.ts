import type { AbsPath } from "../core/AbsPath.ts";
import { relKey } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { openIndexDb } from "./indexDb.service.ts";

const DEFAULT_NEIGHBORS_LIMIT = 8; // lib/index.py:361 — `neighbors`' own default

/** `os.path.basename` on a `/`-separated relative key. */
function basename(path: string): string {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
}

/** A wikilink `dst` may carry a `|display` label (`[[Target|display]]`
 * flattened into `links.dst` unchanged at index time) — strip it before
 * resolving, same as `extractWikilinks`/`extractTypedRelations` do at parse
 * time (`lib/index.py:90,93,394`, `d.split("|")[0].strip()`). */
function beforePipe(raw: string): string {
  const pipeIndex = raw.indexOf("|");
  return (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
}

/** 1-hop wikilink neighbors of a note, by link target name (`lib/index.py:361-366`). */
export async function neighbors(
  container: Container,
  workspace: Workspace,
  path: AbsPath,
  limit: number = DEFAULT_NEIGHBORS_LIMIT,
): Promise<readonly string[]> {
  const { db } = await openIndexDb(container, workspace);
  const rows = db.query<{ readonly dst: string }>(
    "SELECT dst FROM links WHERE src_path=? LIMIT ?",
    [path, limit],
  );
  return rows.map((row) => row.dst);
}

/**
 * Within a candidate set ONLY, count how many OTHER candidates link to each
 * one (`lib/index.py:374-399`, `_inlink_counts`). Feeds the RRF corroboration
 * bonus in `search.ts`'s `searchFused`. A wikilink `dst` is resolved to a
 * candidate by relpath-minus-`.md` first (`relKey`), then by basename;
 * self-links are skipped. Returns an empty map for fewer than 2 candidates —
 * "corroboration" needs at least one other candidate to corroborate from.
 */
export async function inlinkCounts(
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

  const { db } = await openIndexDb(container, workspace);
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
