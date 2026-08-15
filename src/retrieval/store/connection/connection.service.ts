import { parentDir } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import type { Sqlite } from "@/platform/index.ts";
import { SCHEMA, SCHEMA_VERSION } from "@/retrieval/store/schema/schema.constants.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";

export type IndexConnection = {
  readonly db: Sqlite;
  /** True when this open just performed the one-time full rebuild — the stored
   * `PRAGMA user_version` was behind `SCHEMA_VERSION`, so `indexBuild.service.ts`
   * must treat the whole vault as new regardless of `incremental`. */
  readonly forcedFullRebuild: boolean;
};

export class IndexConnectionService {
  constructor(private readonly schemaService: SchemaService) {}

  async open(container: Container, workspace: Workspace): Promise<IndexConnection> {
    await container.fs.mkdir(parentDir(workspace.indexDb));
    const db = container.openDatabase(workspace.indexDb);
    db.exec(SCHEMA);
    const forcedFullRebuild = db.getUserVersion() < SCHEMA_VERSION;
    if (forcedFullRebuild) {
      this.schemaService.reset(db);
    }
    return { db, forcedFullRebuild };
  }
}
