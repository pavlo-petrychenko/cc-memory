import type { Workspace } from "@/core/index.ts";

/**
 * A malformed registry, distinct from a missing file: a missing registry file
 * succeeds with `[]`, while a present-but-broken file is an error.
 * `loadRegistry` validates eagerly rather than deferring to a downstream
 * lookup failure.
 */
export enum RegistryErrorKind {
  /** The file isn't valid TOML. */
  ParseError = "parse_error",
  /** Valid TOML, but not our fixed six-field `[[workspace]]` schema. */
  Malformed = "malformed",
}

export type RegistryError =
  | { readonly kind: RegistryErrorKind.ParseError; readonly message: string }
  | { readonly kind: RegistryErrorKind.Malformed; readonly message: string };

/** The closed set of ways a candidate workspace can conflict with an existing one. */
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

/**
 * The one capability `commands/workspace` needs from the search index,
 * injected through `WorkspaceCommand`'s constructor so this module never
 * imports `@/retrieval` at runtime — `retrieval` itself depends on
 * `workspace` for target resolution, so a direct import back would close a
 * cycle.
 */
export type WorkspaceIndexBuilder = {
  /** Build (or incrementally update) one workspace's index; resolves to its
   * total note count. */
  readonly buildIndex: (workspace: Workspace) => Promise<number>;
  /** The current note count of an already-built index. */
  readonly noteCount: (workspace: Workspace) => Promise<number>;
};
