import type { AbsPath } from "../core/AbsPath.ts";
import { isUnder, sanitizeSlug } from "../core/paths.ts";
import type { RawWorkspace, Workspace, WorktreeSlug } from "../core/Workspace.ts";
import type { Git } from "../platform/git.typedefs.ts";
import { expandWorkspace } from "./registry.service.ts";

const PATH_SEPARATOR = "/";

/**
 * Resolve a `cwd` to exactly one workspace by longest-prefix match, or `null`
 * if `cwd` is under no workspace. This is the encapsulation choke point: a
 * session sees memory for the single workspace returned here and nothing
 * else.
 *
 * `cwd` arrives already expanded (`Env.cwd()` returns an `AbsPath` directly),
 * so there is nothing left to expand here.
 */
export function resolveWorkspace(
  raws: readonly RawWorkspace[],
  cwd: AbsPath,
  home: AbsPath,
): Workspace | null {
  let best: Workspace | null = null;
  let bestPrefixLength = -1;

  for (const raw of raws) {
    const expanded = expandWorkspace(raw, home);
    for (const prefix of expanded.match) {
      const isMatch = cwd === prefix || cwd.startsWith(`${prefix}${PATH_SEPARATOR}`);
      if (!isMatch || prefix.length <= bestPrefixLength) continue;
      bestPrefixLength = prefix.length;
      // `expandWorkspace`'s own default `matchedPrefix` is overridden here with
      // the prefix that actually won this cwd's resolution.
      best = { ...expanded, matchedPrefix: prefix };
    }
  }

  return best;
}

/** `path` relative to `prefix`, given `path` is known to be `prefix` or nested
 * under it (every caller below establishes this before calling). */
function relativeToPrefix(path: AbsPath, prefix: AbsPath): string {
  return path === prefix ? "" : path.slice(prefix.length + 1);
}

/**
 * A worktree's identity within a workspace. Prefers the git worktree root —
 * so distinct git worktrees of one repo get distinct slugs, and subdirs of a
 * repo collapse to the repo root — but only when that root actually lies
 * inside the matched prefix; otherwise falls back to `cwd` (which is
 * guaranteed to be `ws.matchedPrefix` or nested under it, since `ws` was
 * itself resolved for this `cwd`).
 */
export async function worktreeSlug(
  git: Git,
  cwd: AbsPath,
  ws: Workspace,
): Promise<WorktreeSlug> {
  const prefix = ws.matchedPrefix;
  const toplevelOutput = (await git.showToplevel(cwd)).trim();

  let base: AbsPath = cwd;
  if (toplevelOutput !== "") {
    // SAFETY: `git rev-parse --show-toplevel`, on the clean exit that is the only
    // way `Git.showToplevel` returns anything non-empty, always prints an
    // absolute, canonical path with no `.`/`..`/duplicate-slash segments — git's
    // own internals normalize it, so no further normalization is needed here.
    const toplevel = toplevelOutput as AbsPath;
    if (isUnder(toplevel, prefix)) base = toplevel;
  }

  const relative = relativeToPrefix(base, prefix);
  if (relative === "") return "_root";
  // `sanitizeSlug`'s own per-character replacement already turns `/` into
  // `-`, so it can be applied directly to the relative path without a
  // separate path-separator substitution first.
  return sanitizeSlug(relative);
}
