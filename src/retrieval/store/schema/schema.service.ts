import type { SqlDatabase } from "@/platform/index.ts";
import { SCHEMA, SCHEMA_VERSION } from "@/retrieval/store/schema/schema.constants.ts";

/**
 * Drop our derived tables and recreate them at the current schema, then
 * stamp `PRAGMA user_version`. Safe: the markdown vault is the source of
 * truth, so `indexBuild.service.ts` repopulates from scratch.
 */
export function resetSchema(db: SqlDatabase): void {
  db.exec(
    "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; " +
      "DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS worklog_fts; " +
      "DROP TABLE IF EXISTS worklog_files;",
  );
  db.exec(SCHEMA);
  db.setUserVersion(SCHEMA_VERSION);
}
