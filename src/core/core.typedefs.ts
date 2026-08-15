/**
 * A branded absolute, normalized filesystem path.
 *
 * The brand makes "did I expand this?" a compile error: only `paths.utils.ts`'s
 * `expandPath` may produce one, and it is the ONE place a type
 * assertion is allowed.
 */
export type AbsPath = string & { readonly __absPath: unique symbol };

/**
 * A typed result: the boundary error-handling convention for this codebase.
 * Errors are returned, not thrown, across module boundaries.
 * Throwing is reserved for genuinely unreachable states.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Any value that can appear in parsed JSON. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonRecord;

/** A JSON object — every value reachable from `JSON.parse`. */
export type JsonRecord = { readonly [key: string]: JsonValue };
