import { parse as parseToml } from "smol-toml";
import type { TomlTable, TomlValue } from "smol-toml";

import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath, isUnder } from "../core/paths.ts";
import type { Result } from "../core/Result.ts";
import type { RawWorkspace, Workspace } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import { serializeRegistry } from "./registryToml.renderer.ts";

/**
 * Workspace registry: read/write/validate `~/.claude/memory/registry.toml`. A
 * workspace is stored with `~`-relative paths (portability); callers expand
 * via `expandWorkspace` before touching the filesystem for real.
 */

// A literal `~/`-prefix (not a bare relative path) — `expandPath` only expands a
// LEADING `~`, matching `container.ts`'s `LOG_FILE_HOME_RELATIVE_PATH` pattern.
const REGISTRY_HOME_RELATIVE_PATH = "~/.claude/memory/registry.toml";

/** The registry file path, given a home directory. */
export function defaultRegistryPath(home: AbsPath): AbsPath {
  return expandPath(REGISTRY_HOME_RELATIVE_PATH, home);
}

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

function malformed(message: string): Result<RawWorkspace, RegistryError> {
  return { ok: false, error: { kind: RegistryErrorKind.Malformed, message } };
}

// `typeof` only distinguishes JS representations, not TOML's domain values (a
// `TomlDate` is also `"object"`) — `Object.prototype.toString` gives the precise
// tag instead, the same technique `domain/note.ts`'s `isYamlMapping` uses for the
// analogous YAML-boundary check.
function isTomlString(value: TomlValue | undefined): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isTomlStringArray(value: TomlValue | undefined): value is string[] {
  return Array.isArray(value) && value.every(isTomlString);
}

function isTomlTableValue(value: TomlValue): value is TomlTable {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * One `[[workspace]]` block: a table with `id`/`kb`/`worklogs`/`index_db`
 * strings, a `match` array of strings, and an optional `exclude` array of
 * strings (defaulted to `[]`) — `exclude` is the one field that isn't
 * required.
 */
function parseRawWorkspaceEntry(
  entry: TomlValue,
  index: number,
): Result<RawWorkspace, RegistryError> {
  if (!isTomlTableValue(entry)) {
    return malformed(`workspace[${index}] must be a table`);
  }
  const table: TomlTable = entry;
  const id = table["id"];
  const match = table["match"];
  const kb = table["kb"];
  const worklogs = table["worklogs"];
  const indexDb = table["index_db"];
  const exclude = table["exclude"];

  if (!isTomlString(id)) return malformed(`workspace[${index}].id must be a string`);
  if (!isTomlStringArray(match)) {
    return malformed(`workspace[${index}].match must be an array of strings`);
  }
  if (!isTomlString(kb)) return malformed(`workspace[${index}].kb must be a string`);
  if (!isTomlString(worklogs)) {
    return malformed(`workspace[${index}].worklogs must be a string`);
  }
  if (!isTomlString(indexDb)) {
    return malformed(`workspace[${index}].index_db must be a string`);
  }
  if (exclude !== undefined && !isTomlStringArray(exclude)) {
    return malformed(`workspace[${index}].exclude must be an array of strings`);
  }

  return {
    ok: true,
    value: { id, match, kb, worklogs, exclude: exclude ?? [], indexDb },
  };
}

/**
 * Return the registry's raw workspace list. A missing file is empty, not an
 * error — only a PRESENT file that fails to parse or doesn't match the schema
 * becomes a `RegistryError`. Callers that must fail open (the hooks) treat the
 * error as "no workspace" and log it; the CLI reports it.
 */
export async function loadRegistry(
  fs: FileSystem,
  path: AbsPath,
): Promise<Result<readonly RawWorkspace[], RegistryError>> {
  if (!(await fs.exists(path))) return { ok: true, value: [] };
  const stat = await fs.stat(path);
  // A directory at this path is not a valid registry file.
  if (!stat.isFile) return { ok: true, value: [] };

  const content = await fs.readFile(path);

  let parsed: TomlTable;
  try {
    parsed = parseToml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: RegistryErrorKind.ParseError, message } };
  }

  const workspaceValue = parsed["workspace"];
  // An absent "workspace" key is empty, not malformed.
  if (workspaceValue === undefined) return { ok: true, value: [] };
  if (!Array.isArray(workspaceValue)) {
    return {
      ok: false,
      error: {
        kind: RegistryErrorKind.Malformed,
        message: "'workspace' must be an array of tables",
      },
    };
  }

  const workspaces: RawWorkspace[] = [];
  for (const [index, entry] of workspaceValue.entries()) {
    const result = parseRawWorkspaceEntry(entry, index);
    if (!result.ok) return result;
    workspaces.push(result.value);
  }
  return { ok: true, value: workspaces };
}

/** The parent directory of an absolute, normalized path, itself absolute. */
function parentDir(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields another
  // absolute, normalized path (or the root `/`) — same reasoning `paths.ts`
  // documents for `expandPath`'s own cast.
  return sliced as AbsPath;
}

/**
 * Write the registry atomically: `<path>.tmp` then rename over it, so a
 * reader never observes a half-written file. Uses `serializeRegistry` rather
 * than a hand-rolled or `smol-toml`-stringified serialization, since this
 * file is user-owned and rewritten in place — `smol-toml`'s array formatting
 * would produce spurious diff churn.
 */
export async function saveRegistry(
  fs: FileSystem,
  path: AbsPath,
  workspaces: readonly RawWorkspace[],
): Promise<void> {
  await fs.mkdir(parentDir(path));
  const tmpPath = `${path}.tmp`;
  // SAFETY: appending a fixed `.tmp` suffix to an absolute, normalized path
  // cannot introduce a `~`, `.` or `..` segment.
  const tmpAbsPath = tmpPath as AbsPath;
  await fs.writeFile(tmpAbsPath, serializeRegistry(workspaces));
  await fs.rename(tmpAbsPath, path);
}

/** Finds a workspace by id, over an already-loaded list. */
export function findWorkspace(
  raws: readonly RawWorkspace[],
  id: string,
): RawWorkspace | null {
  return raws.find((raw) => raw.id === id) ?? null;
}

/**
 * Expand every path field to an absolute, normalized `AbsPath` — the only way
 * to produce a `Workspace` (see `Workspace.ts`'s doc comment).
 *
 * `matchedPrefix` defaults to the first `match` entry (falling back to `kb` if
 * `match` is empty). `resolveWorkspace` overrides `matchedPrefix` with the
 * real matched prefix once a specific `cwd` picks one; the default here only
 * surfaces for a caller that expands a workspace directly, outside cwd
 * resolution (e.g. the CLI acting on a workspace by id), where no single
 * prefix is actually meaningful.
 */
export function expandWorkspace(raw: RawWorkspace, home: AbsPath): Workspace {
  const match = raw.match.map((entry) => expandPath(entry, home));
  const kb = expandPath(raw.kb, home);
  const worklogs = expandPath(raw.worklogs, home);
  const indexDb = expandPath(raw.indexDb, home);
  return {
    id: raw.id,
    match,
    kb,
    worklogs,
    exclude: raw.exclude,
    indexDb,
    matchedPrefix: match[0] ?? kb,
  };
}

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

// Required fields: id, match, kb, worklogs, index_db — `exclude` is
// deliberately not required.
function requiredFieldConflicts(candidate: RawWorkspace): readonly RegistryConflict[] {
  const conflicts: RegistryConflict[] = [];
  if (candidate.id === "") {
    conflicts.push({ kind: RegistryConflictKind.MissingField, field: "id" });
  }
  if (candidate.match.length === 0) {
    conflicts.push({ kind: RegistryConflictKind.MissingField, field: "match" });
  }
  if (candidate.kb === "") {
    conflicts.push({ kind: RegistryConflictKind.MissingField, field: "kb" });
  }
  if (candidate.worklogs === "") {
    conflicts.push({ kind: RegistryConflictKind.MissingField, field: "worklogs" });
  }
  if (candidate.indexDb === "") {
    conflicts.push({ kind: RegistryConflictKind.MissingField, field: "index_db" });
  }
  return conflicts;
}

/**
 * Every way `candidate` conflicts with `existing` — unique `id`, no
 * overlapping `match` prefix in EITHER direction, no `kb` nested with another
 * workspace's `kb` in either direction. Returns the complete list of
 * conflicts rather than stopping at the first, so a caller (the CLI) can
 * report every problem at once.
 *
 * `match`/`kb` are stored `~`-relative (`RawWorkspace`), so `home` is required
 * to expand both sides before comparing.
 */
export function validateNew(
  candidate: RawWorkspace,
  existing: readonly RawWorkspace[],
  home: AbsPath,
): readonly RegistryConflict[] {
  const conflicts: RegistryConflict[] = [...requiredFieldConflicts(candidate)];

  const isNestedEither = (a: string, b: string): boolean =>
    isUnder(expandPath(a, home), expandPath(b, home)) ||
    isUnder(expandPath(b, home), expandPath(a, home));

  for (const other of existing) {
    if (other.id === candidate.id) {
      conflicts.push({ kind: RegistryConflictKind.DuplicateId, id: candidate.id });
    }

    for (const newPrefix of candidate.match) {
      for (const oldPrefix of other.match) {
        if (isNestedEither(newPrefix, oldPrefix)) {
          conflicts.push({
            kind: RegistryConflictKind.MatchOverlap,
            prefix: newPrefix,
            otherId: other.id,
            otherPrefix: oldPrefix,
          });
        }
      }
    }

    if (isNestedEither(candidate.kb, other.kb)) {
      conflicts.push({
        kind: RegistryConflictKind.KbNested,
        kb: candidate.kb,
        otherId: other.id,
        otherKb: other.kb,
      });
    }
  }

  return conflicts;
}
