/**
 * A typed result: the boundary error-handling convention for this codebase.
 * Errors are returned, not thrown, across module boundaries.
 * Throwing is reserved for genuinely unreachable states.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
