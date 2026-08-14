/**
 * Diagnostics for the fail-open invariant ([[bugfixes]] #9): today's 15 bare
 * `except Exception: pass` blocks leave a broken memory system indistinguishable
 * from a quiet one. `runHook`/the CLI still catch everything and always exit 0 —
 * but now log first. Real implementation (`adapters/loggerFile.adapter.ts`) is a
 * size-capped rotating file; level filtering against `Config.logLevel` happens
 * where the real logger is constructed (`container.ts`), not in every call site.
 */
export type Logger = {
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
};
