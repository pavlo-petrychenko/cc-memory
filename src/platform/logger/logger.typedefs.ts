/**
 * Diagnostics for the fail-open invariant: hooks and the CLI catch everything
 * and always exit 0, so a broken memory system would otherwise be
 * indistinguishable from a quiet one — this logger lets them log first. Real
 * implementation (`logger.adapter.ts`) is a size-capped rotating
 * file; level filtering against `Config.logLevel` happens where the real
 * logger is constructed (`container.ts`), not in every call site.
 */
export type Logger = {
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
};
