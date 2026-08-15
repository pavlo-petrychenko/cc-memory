/**
 * Every value this project ever binds into or reads out of SQLite: note/worklog
 * text fields, `importance` (integer), `mtime` (real), and boolean/absence for
 * anything else a future query needs. Deliberately concrete rather than
 * `unknown` — the anti-slop `no-unsafe-dictionary-type`/`no-unknown-parameters`
 * rules push the same way the SQL boundary already does: bind values are one of
 * a small closed set of SQLite storage classes, never an arbitrary object.
 */
export type SqlValue = string | number | boolean | null;

/**
 * The index database, as an interface. **Never faked** — FTS5's porter stemmer,
 * `bm25()` weighting and `NEAR` semantics ARE the behavior under test; a fake
 * would exercise none of it. Every test that needs a `SqlDatabase` opens a real
 * `bun:sqlite` `:memory:` database via the real adapter.
 *
 * `exec`/`query`/`run` split the way `bun:sqlite`'s `Database` does: `exec` runs
 * a script of one or more unparameterized statements (schema DDL); `query`
 * returns rows (SELECT); `run` executes one parameterized statement without
 * reading rows back (INSERT/UPDATE/DELETE). `userVersion` get/set wraps
 * `PRAGMA user_version`, the schema-version check that decides whether the
 * index needs a full rebuild.
 */
export type SqlDatabase = {
  readonly exec: (sql: string) => void;
  readonly query: <RowType>(
    sql: string,
    params: readonly SqlValue[],
  ) => readonly RowType[];
  readonly run: (sql: string, params: readonly SqlValue[]) => void;
  readonly getUserVersion: () => number;
  readonly setUserVersion: (version: number) => void;
  readonly close: () => void;
};
