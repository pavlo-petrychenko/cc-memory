/**
 * A branded absolute, normalized filesystem path.
 *
 * The brand makes "did I expand this?" a compile error: only `paths.ts`'s
 * `expandPath` may produce one, and it is the ONE place a type
 * assertion is allowed.
 */
export type AbsPath = string & { readonly __absPath: unique symbol };
