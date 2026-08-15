/** A branded absolute, normalized filesystem path. The brand makes "did I expand
 * this?" a compile error: only `paths.utils.ts` may produce one. */
export type AbsPath = string & { readonly __absPath: unique symbol };

/** The boundary error-handling convention for this codebase: errors are returned,
 * not thrown, across module boundaries. */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonRecord;

export type JsonRecord = { readonly [key: string]: JsonValue };
