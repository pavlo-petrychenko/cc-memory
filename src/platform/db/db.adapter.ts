import { Database, type Statement } from "bun:sqlite";

import type { SqlDatabase, SqlValue } from "@/platform/db/db.typedefs.ts";

/**
 * The real `SqlDatabase`: one `bun:sqlite` handle per process, with a prepared-statement
 * cache keyed by the SQL string itself. Every SQL string this project runs is a
 * literal constant (never built by string concatenation with untrusted input),
 * so caching by exact string is safe and bounded — there is no query-string
 * fuzzing here that would make the cache grow unboundedly.
 *
 * Bind values are `SqlValue` — `bun:sqlite` accepts a plain array of values for
 * a positional-`?`-parameterized statement.
 */
export class DatabaseAdapter implements SqlDatabase {
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

  query<RowType>(sql: string, params: readonly SqlValue[]): readonly RowType[] {
    // SAFETY: `bun:sqlite` has no way to type a row by the SQL text alone; the
    // caller supplies `RowType` to match the columns their own SQL selects.
    return this.prepared(sql).all(...params) as RowType[];
  }

  run(sql: string, params: readonly SqlValue[]): void {
    this.prepared(sql).run(...params);
  }

  getUserVersion(): number {
    // SAFETY: `PRAGMA user_version` always returns exactly one row shaped
    // `{ user_version: <integer> }` (SQLite's own pragma contract), never a
    // different column set — the fallback `?? 0` only covers a driver-level
    // empty result, not a mismatched shape.
    const row = this.database.query("PRAGMA user_version").get() as {
      user_version: number;
    } | null;
    return row?.user_version ?? 0;
  }

  setUserVersion(version: number): void {
    // PRAGMA does not accept a bound parameter, so the (trusted, integer)
    // version is interpolated directly.
    this.database.exec(`PRAGMA user_version = ${version}`);
  }

  close(): void {
    this.database.close();
  }
}
