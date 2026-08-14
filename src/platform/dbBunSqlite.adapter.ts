import { Database, type Statement } from "bun:sqlite";

import type { Db, DbValue } from "./db.port.ts";

/**
 * The real `Db`: one `bun:sqlite` handle per process, with a prepared-statement
 * cache keyed by the SQL string itself. Replaces `lib/index.py`'s `connect()`,
 * which opened a fresh `sqlite3.connect(db)` per call — three separate
 * connections per prompt (notes search, worklog search, inlink counts),
 * [[bugfixes]] #6. Every SQL string this project runs is a literal constant
 * (never built by string concatenation with untrusted input), so caching by
 * exact string is safe and bounded — there is no query-string fuzzing here that
 * would make the cache grow unboundedly.
 *
 * Bind values are `DbValue` — `bun:sqlite` accepts a plain array of values for a
 * positional-`?`-parameterized statement, same shape as Python's
 * `sqlite3`/DB-API parameter tuples.
 */
export function makeDbBunSqliteAdapter(path: string): Db {
  const database = new Database(path);
  const statementCache = new Map<string, Statement>();

  function prepared(sql: string): Statement {
    const cached = statementCache.get(sql);
    if (cached !== undefined) return cached;
    const statement = database.prepare(sql);
    statementCache.set(sql, statement);
    return statement;
  }

  return {
    exec: (sql: string) => {
      database.exec(sql);
    },
    query: <RowType>(sql: string, params: readonly DbValue[]): readonly RowType[] => {
      // SAFETY: `bun:sqlite` has no way to type a row by the SQL text alone; the
      // caller supplies `RowType` to match the columns their own SQL selects
      // (mirrors `sqlite3.Row` being read positionally/by-name in the Python).
      return prepared(sql).all(...params) as RowType[];
    },
    run: (sql: string, params: readonly DbValue[]) => {
      prepared(sql).run(...params);
    },
    getUserVersion: () => {
      // SAFETY: `PRAGMA user_version` always returns exactly one row shaped
      // `{ user_version: <integer> }` (SQLite's own pragma contract), never a
      // different column set — the fallback `?? 0` only covers a driver-level
      // empty result, not a mismatched shape.
      const row = database.query("PRAGMA user_version").get() as {
        user_version: number;
      } | null;
      return row?.user_version ?? 0;
    },
    setUserVersion: (version: number) => {
      // PRAGMA does not accept a bound parameter, so the (trusted, integer)
      // version is interpolated directly — `index.py:66`'s `f"PRAGMA
      // user_version = {SCHEMA_VERSION}"` does the same.
      database.exec(`PRAGMA user_version = ${version}`);
    },
    close: () => {
      database.close();
    },
  };
}
