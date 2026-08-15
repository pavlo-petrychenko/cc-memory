import { parse as parseToml } from "smol-toml";
import type { TomlTable, TomlValue } from "smol-toml";

import type { AbsPath } from "@/core/index.ts";
import { absPath, expandPath, isUnder, parentDir, registryPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import type { RegistryTomlSerializer } from "@/modules/workspace/serializers/registryToml/registryToml.serializer.ts";
import {
  type RegistryConflict,
  RegistryConflictKind,
  type RegistryError,
  RegistryErrorKind,
} from "@/modules/workspace/workspace.typedefs.ts";

export function defaultRegistryPath(home: AbsPath): AbsPath {
  return registryPath(home);
}

function malformed(message: string): Result<RawWorkspace, RegistryError> {
  return { ok: false, error: { kind: RegistryErrorKind.Malformed, message } };
}

// `typeof` can't distinguish a TOML domain value from a plain object (a `TomlDate`
// is also `"object"`) — `Object.prototype.toString` gives the precise tag instead.
function isTomlString(value: TomlValue | undefined): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isTomlStringArray(value: TomlValue | undefined): value is string[] {
  return Array.isArray(value) && value.every(isTomlString);
}

function isTomlTableValue(value: TomlValue): value is TomlTable {
  return Object.prototype.toString.call(value) === "[object Object]";
}

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

/** A missing file is empty, not an error — only a present file that fails to parse
 * or doesn't match the schema becomes a `RegistryError`. */
export async function loadRegistry(
  fs: FileSystem,
  path: AbsPath,
): Promise<Result<readonly RawWorkspace[], RegistryError>> {
  if (!(await fs.exists(path))) return { ok: true, value: [] };
  const stat = await fs.stat(path);
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

export function findWorkspace(
  raws: readonly RawWorkspace[],
  id: string,
): RawWorkspace | null {
  return raws.find((raw) => raw.id === id) ?? null;
}

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

/** Returns every conflict rather than stopping at the first, so the CLI can report
 * all of them at once. `match`/`kb` are `~`-relative, so `home` expands both sides
 * before comparing. */
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

export class RegistryService {
  constructor(
    private readonly fs: FileSystem,
    private readonly tomlSerializer: RegistryTomlSerializer,
  ) {}

  defaultPath(home: AbsPath): AbsPath {
    return defaultRegistryPath(home);
  }

  async load(path: AbsPath): Promise<Result<readonly RawWorkspace[], RegistryError>> {
    return loadRegistry(this.fs, path);
  }

  async save(path: AbsPath, workspaces: readonly RawWorkspace[]): Promise<void> {
    await this.fs.mkdir(parentDir(path));
    const tmpAbsPath = absPath(`${path}.tmp`);
    await this.fs.writeFile(tmpAbsPath, this.tomlSerializer.serialize(workspaces));
    await this.fs.rename(tmpAbsPath, path);
  }

  find(raws: readonly RawWorkspace[], id: string): RawWorkspace | null {
    return findWorkspace(raws, id);
  }

  expandWorkspace(raw: RawWorkspace, home: AbsPath): Workspace {
    return expandWorkspace(raw, home);
  }

  validateNew(
    candidate: RawWorkspace,
    existing: readonly RawWorkspace[],
    home: AbsPath,
  ): readonly RegistryConflict[] {
    return validateNew(candidate, existing, home);
  }
}
