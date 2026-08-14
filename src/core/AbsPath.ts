/**
 * A branded absolute, normalized filesystem path.
 *
 * Ported from the PoC's implicit convention: `registry.expand_ws` returned a dict
 * whose path fields were absolute strings, and every function had to remember
 * whether `expand_ws` had already run over the workspace it was handed. That
 * ambiguity was the single biggest bug surface in the PoC (see the migration plan's
 * "architecture" doc, decision #1).
 *
 * The brand makes "did I expand this?" a compile error: only `paths.ts`'s
 * `expandPath` may produce one, and it is the ONE place a type
 * assertion is allowed (CLAUDE.md).
 */
export type AbsPath = string & { readonly __absPath: unique symbol };
