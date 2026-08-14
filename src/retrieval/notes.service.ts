import { stripChars } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { openIndexDb } from "./indexDb.service.ts";

/** One row of `listNotes` — path is relative to the workspace's `kb`, WITH the
 * `.md` extension kept (unlike `core/paths.ts`'s `relKey`, which strips it). */
export type NoteSummary = {
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
};

/** Every indexed path is always under `kb`, so this is just prefix-stripping;
 * falls back to the raw path unchanged otherwise. */
function relativeToKb(path: string, kb: string): string {
  const prefix = `${kb}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Enumerate every indexed note (optionally under a folder prefix), sorted by
 * path. Exhaustive (not recall-limited like `search.service.ts`'s BM25
 * queries) — the basis for auditing a whole feature folder. An empty or
 * absent `folder` returns everything.
 */
export async function listNotes(
  container: Container,
  workspace: Workspace,
  folder?: string,
): Promise<readonly NoteSummary[]> {
  const { db } = await openIndexDb(container, workspace);
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
    const relativePath = relativeToKb(row.path, workspace.kb);
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
