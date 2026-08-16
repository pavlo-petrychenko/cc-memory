/** Deliberately concrete rather than `unknown` — a bind value is one of a small
 * closed set of SQLite storage classes, never an arbitrary object. */
export type SqlParameter = string | number | boolean | null;

/** **Never faked** — FTS5's porter stemmer, `bm25()` weighting and `NEAR` semantics
 * ARE the behavior under test. `exec` runs unparameterized DDL, `query` returns
 * rows, `run` executes one parameterized statement without reading rows back. */
export type Sqlite = {
  readonly exec: (sql: string) => void;
  readonly query: <RowType>(
    sql: string,
    params: readonly SqlParameter[],
  ) => readonly RowType[];
  readonly run: (sql: string, params: readonly SqlParameter[]) => void;
  readonly getUserVersion: () => number;
  readonly setUserVersion: (version: number) => void;
  readonly close: () => void;
};
