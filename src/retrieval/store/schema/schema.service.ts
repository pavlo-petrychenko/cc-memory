import type { Sqlite } from "@/gateways/index.ts";
import { SCHEMA, SCHEMA_VERSION } from "@/retrieval/store/schema/schema.constants.ts";

export class SchemaService {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  /** Safe: the markdown vault is the source of truth, so `indexBuild.service.ts`
   * repopulates from scratch. */
  reset(db: Sqlite): void {
    db.exec(
      "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; " +
        "DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS worklog_fts; " +
        "DROP TABLE IF EXISTS worklog_files;",
    );
    db.exec(SCHEMA);
    db.setUserVersion(SCHEMA_VERSION);
  }
}
