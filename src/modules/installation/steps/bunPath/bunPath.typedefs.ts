export enum BunPathErrorKind {
  NotFound = "not_found",
  Unresolvable = "unresolvable",
}

export type BunPathError =
  | { readonly kind: BunPathErrorKind.NotFound }
  | { readonly kind: BunPathErrorKind.Unresolvable; readonly attemptedPath: string };
