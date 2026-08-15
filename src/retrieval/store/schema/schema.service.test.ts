import { describe, expect, test } from "bun:test";

import { SqliteAdapter } from "@/platform/index.ts";
import { SCHEMA, SCHEMA_VERSION } from "@/retrieval/store/schema/schema.constants.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";

const schemaService = new SchemaService();

describe("index/schema", () => {
  test("SCHEMA_VERSION is 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  test("SCHEMA creates notes, notes_fts, links, worklog_fts and worklog_files", () => {
    const db = new SqliteAdapter(":memory:");
    db.exec(SCHEMA);

    const tableNames = db
      .query<{ readonly name: string }>(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
        [],
      )
      .map((row: { readonly name: string }) => row.name);

    expect(tableNames).toContain("notes");
    expect(tableNames).toContain("notes_fts");
    expect(tableNames).toContain("links");
    expect(tableNames).toContain("worklog_fts");
    expect(tableNames).toContain("worklog_files");
    db.close();
  });

  test("SCHEMA is idempotent (CREATE ... IF NOT EXISTS)", () => {
    const db = new SqliteAdapter(":memory:");
    db.exec(SCHEMA);
    db.exec(SCHEMA); // must not throw on a second exec
    expect(db.getUserVersion()).toBe(0);
    db.close();
  });

  test("reset drops and recreates every table, then stamps PRAGMA user_version", () => {
    const db = new SqliteAdapter(":memory:");
    db.exec(SCHEMA);
    db.run("INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?)", [
      "a.md",
      "A",
      "note",
      null,
      1,
    ]);

    schemaService.reset(db);

    expect(db.getUserVersion()).toBe(SCHEMA_VERSION);
    expect(db.query("SELECT * FROM notes", [])).toEqual([]);
    db.close();
  });
});
