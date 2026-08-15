import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import type { SqlDatabase } from "@/platform/index.ts";
import { SchemaService, SCHEMA, SCHEMA_VERSION } from "@/retrieval/store/schema/index.ts";

export type IndexConnection = {
  readonly db: SqlDatabase;
  /** True when opening this handle just performed the one-time full
   * rebuild — the stored `PRAGMA user_version` was behind `SCHEMA_VERSION`,
   * so every existing row was wiped and `indexBuild.service.ts` must treat
   * the whole vault as new regardless of what `incremental` was asked for. */
  readonly forcedFullRebuild: boolean;
};

/** The parent directory of an already-absolute, normalized `AbsPath`. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an already-absolute, already-normalized `AbsPath` at a `/`
  // boundary can only yield another absolute, normalized path (or the root
  // `/`).
  return sliced as AbsPath;
}

export class IndexConnectionService {
  constructor(private readonly schemaService: SchemaService = new SchemaService()) {}

  /**
   * Open (or reuse, one handle per process via `container.openDatabase`'s
   * memoization) the index database for one workspace: ensure its parent
   * directory exists, create any table that's missing, and decide whether the
   * stored schema version forces a full rebuild.
   *
   * Idempotent: once a full rebuild has run, `PRAGMA user_version` reads back as
   * `SCHEMA_VERSION`, so every subsequent open of the same handle sees
   * `forcedFullRebuild: false` — matching `indexBuild.service.ts` and
   * `SqlDatabase`'s once-per-process-per-path pattern.
   */
  async open(container: Container, workspace: Workspace): Promise<IndexConnection> {
    await container.fs.mkdir(parentDirectory(workspace.indexDb));
    const db = container.openDatabase(workspace.indexDb);
    db.exec(SCHEMA); // create anything missing — a fresh DB gets the current tokenizer
    const forcedFullRebuild = db.getUserVersion() < SCHEMA_VERSION;
    if (forcedFullRebuild) {
      this.schemaService.reset(db); // tokenizer/schema changed -> one-time full rebuild
    }
    return { db, forcedFullRebuild };
  }
}
