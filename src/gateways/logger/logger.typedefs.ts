/** Diagnostics for the fail-open invariant: hooks and the CLI catch everything and
 * always exit 0, so a broken memory system would otherwise be indistinguishable
 * from a quiet one — this logger lets them log first. */
export type Logger = {
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
};
