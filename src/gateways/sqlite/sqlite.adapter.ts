import { Database, type Statement } from "bun:sqlite";

import type { Sqlite, SqlParameter } from "@/gateways/sqlite/sqlite.typedefs.ts";

/** One `bun:sqlite` handle per process, with a prepared-statement cache keyed by
 * the SQL string itself — safe and bounded because every SQL string this project
 * runs is a literal constant, never built by string concatenation. */
export class SqliteAdapter implements Sqlite {
  private readonly database: Database;
  private readonly statementCache = new Map<string, Statement>();

  constructor(path: string) {
    this.database = new Database(path);
  }

  private prepared(sql: string): Statement {
    const cached = this.statementCache.get(sql);
    if (cached !== undefined) return cached;
    const statement = this.database.prepare(sql);
    this.statementCache.set(sql, statement);
    return statement;
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  query<RowType>(sql: string, params: readonly SqlParameter[]): readonly RowType[] {
    // SAFETY: `bun:sqlite` has no way to type a row by the SQL text alone; the
    // caller supplies `RowType` to match the columns their own SQL selects.
    return this.prepared(sql).all(...params) as RowType[];
  }

  run(sql: string, params: readonly SqlParameter[]): void {
    this.prepared(sql).run(...params);
  }

  getUserVersion(): number {
    // SAFETY: `PRAGMA user_version` always returns exactly one row shaped
    // `{ user_version: <integer> }` — SQLite's own pragma contract.
    const row = this.database.query("PRAGMA user_version").get() as {
      user_version: number;
    } | null;
    return row?.user_version ?? 0;
  }

  setUserVersion(version: number): void {
    // PRAGMA does not accept a bound parameter; the integer is trusted, interpolated.
    this.database.exec(`PRAGMA user_version = ${version}`);
  }

  close(): void {
    this.database.close();
  }
}
