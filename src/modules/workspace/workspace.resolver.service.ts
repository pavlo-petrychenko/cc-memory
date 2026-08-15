import type { AbsPath } from "@/core/index.ts";
import { absPath, isUnder, sanitizeSlug } from "@/core/index.ts";
import type { RawWorkspace, Workspace, WorktreeSlug } from "@/core/index.ts";
import { PATH_SEPARATOR } from "@/modules/workspace/workspace.constants.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/workspace.validator.service.ts";

function relativeToPrefix(path: AbsPath, prefix: AbsPath): string {
  return path === prefix ? "" : path.slice(prefix.length + 1);
}

/** Prefers the git worktree root — so distinct worktrees of one repo get distinct
 * slugs, and subdirs collapse to the repo root — but only when that root actually
 * lies inside the matched prefix; otherwise falls back to `cwd`. The git toplevel
 * OUTPUT is supplied by the repository (the only layer that may touch git). */
export function worktreeSlug(
  toplevelOutput: string,
  cwd: AbsPath,
  ws: Workspace,
): WorktreeSlug {
  const prefix = ws.matchedPrefix;

  let base: AbsPath = cwd;
  if (toplevelOutput !== "") {
    // A clean `git rev-parse --show-toplevel` always prints an absolute, canonical
    // path already — no further normalization needed, just `absPath`'s validation.
    const toplevel = absPath(toplevelOutput);
    if (isUnder(toplevel, prefix)) base = toplevel;
  }

  const relative = relativeToPrefix(base, prefix);
  if (relative === "") return "_root";
  return sanitizeSlug(relative);
}

/** Pure longest-prefix workspace resolution — no git, no filesystem. */
export class WorkspaceResolverService {
  constructor(private readonly validatorService: WorkspaceValidatorService) {}

  /** Longest-prefix match, or `null` if `cwd` is under no workspace — the
   * encapsulation choke point: a session sees memory for the single workspace
   * returned here and nothing else. */
  resolveWorkspace(
    raws: readonly RawWorkspace[],
    cwd: AbsPath,
    home: AbsPath,
  ): Workspace | null {
    let best: Workspace | null = null;
    let bestPrefixLength = -1;

    for (const raw of raws) {
      const expanded = this.validatorService.expandWorkspace(raw, home);
      for (const prefix of expanded.match) {
        const isMatch = cwd === prefix || cwd.startsWith(`${prefix}${PATH_SEPARATOR}`);
        if (!isMatch || prefix.length <= bestPrefixLength) continue;
        bestPrefixLength = prefix.length;
        best = { ...expanded, matchedPrefix: prefix };
      }
    }

    return best;
  }

  worktreeSlug(toplevelOutput: string, cwd: AbsPath, ws: Workspace): WorktreeSlug {
    return worktreeSlug(toplevelOutput, cwd, ws);
  }
}
