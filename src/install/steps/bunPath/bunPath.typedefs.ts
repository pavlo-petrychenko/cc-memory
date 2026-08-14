export enum BunPathErrorKind {
  /** `which bun` found nothing on `$PATH`. */
  NotFound = "not_found",
  /** `readlink -f` failed, or the path it printed doesn't exist on disk —
   * either way, refuse rather than record something ephemeral. */
  Unresolvable = "unresolvable",
}

export type BunPathError =
  | { readonly kind: BunPathErrorKind.NotFound }
  | { readonly kind: BunPathErrorKind.Unresolvable; readonly attemptedPath: string };
