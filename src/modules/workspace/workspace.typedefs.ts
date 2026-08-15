import type { Workspace } from "@/core/index.ts";

/** A malformed registry, distinct from a missing file: a missing registry file
 * succeeds with `[]`, while a present-but-broken file is an error. */
export enum RegistryErrorKind {
  ParseError = "parse_error",
  Malformed = "malformed",
}

export type RegistryError =
  | { readonly kind: RegistryErrorKind.ParseError; readonly message: string }
  | { readonly kind: RegistryErrorKind.Malformed; readonly message: string };

export enum RegistryConflictKind {
  MissingField = "missing_field",
  DuplicateId = "duplicate_id",
  MatchOverlap = "match_overlap",
  KbNested = "kb_nested",
}

export type RegistryConflict =
  | { readonly kind: RegistryConflictKind.MissingField; readonly field: string }
  | { readonly kind: RegistryConflictKind.DuplicateId; readonly id: string }
  | {
      readonly kind: RegistryConflictKind.MatchOverlap;
      readonly prefix: string;
      readonly otherId: string;
      readonly otherPrefix: string;
    }
  | {
      readonly kind: RegistryConflictKind.KbNested;
      readonly kb: string;
      readonly otherId: string;
      readonly otherKb: string;
    };

export type WorkspaceLsRow = { readonly summaryLine: string; readonly matchLine: string };

/** The one capability `commands/workspace` needs from the search index, injected
 * so this module never imports `@/retrieval` at runtime — `retrieval` itself
 * depends on `workspace`, so a direct import back would close a cycle. */
export type WorkspaceIndexBuilder = {
  readonly buildIndex: (workspace: Workspace) => Promise<number>;
  readonly noteCount: (workspace: Workspace) => Promise<number>;
};
