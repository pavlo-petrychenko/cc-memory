import type { AbsPath } from "@/core/index.ts";
import { expandPath, isUnder } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import {
  type RegistryConflict,
  RegistryConflictKind,
} from "@/modules/workspace/workspace.typedefs.ts";

export function noSuchWorkspaceMessage(id: string): string {
  return `no such workspace: ${id}`;
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

/** Returns every conflict rather than stopping at the first, so the CLI can
 * report all of them at once. `match`/`kb` are `~`-relative, so `home` expands
 * both sides before comparing. */
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

/** Pure registry domain logic: expand `~`-relative fields, find by id, and
 * validate a candidate against existing workspaces. No I/O. The free functions
 * above are the canonical API; the class exists for constructor injection. */
export class WorkspaceValidatorService {
  noSuchWorkspaceMessage(id: string): string {
    return noSuchWorkspaceMessage(id);
  }

  findWorkspace(raws: readonly RawWorkspace[], id: string): RawWorkspace | null {
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
