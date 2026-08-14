import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import type { Db } from "../platform/db.port.ts";
import { resetSchema, SCHEMA, SCHEMA_VERSION } from "./schema.service.ts";

/** The parent directory of an already-absolute, normalized `AbsPath`. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an already-absolute, already-normalized `AbsPath` at a `/`
  // boundary can only yield another absolute, normalized path (or the root
  // `/`) — the same reasoning `tests/helpers/fakes/fsMemory.fake.ts`'s
  // `parentOf` documents for the identical operation.
  return sliced as AbsPath;
}

export type IndexDbHandle = {
  readonly db: Db;
  /** True when opening this handle just performed the one-time full
   * rebuild — the stored `PRAGMA user_version` was behind `SCHEMA_VERSION`,
   * so every existing row was wiped and `build.service.ts` must treat the
   * whole vault as new regardless of what `incremental` was asked for. */
  readonly forcedFullRebuild: boolean;
};

/**
 * Open (or reuse, one handle per process via `container.openDb`'s
 * memoization) the index database for one workspace: ensure its parent
 * directory exists, create any table that's missing, and decide whether the
 * stored schema version forces a full rebuild.
 *
 * Idempotent: once a full rebuild has run, `PRAGMA user_version` reads back as
 * `SCHEMA_VERSION`, so every subsequent open of the same handle sees
 * `forcedFullRebuild: false` — matching `build.service.ts` and `Db`'s
 * once-per-process-per-path pattern.
 */
export async function openIndexDb(
  container: Container,
  workspace: Workspace,
): Promise<IndexDbHandle> {
  await container.fs.mkdir(parentDirectory(workspace.indexDb));
  const db = container.openDb(workspace.indexDb);
  db.exec(SCHEMA); // create anything missing — a fresh DB gets the current tokenizer
  const forcedFullRebuild = db.getUserVersion() < SCHEMA_VERSION;
  if (forcedFullRebuild) {
    resetSchema(db); // tokenizer/schema changed -> one-time full rebuild
  }
  return { db, forcedFullRebuild };
}
