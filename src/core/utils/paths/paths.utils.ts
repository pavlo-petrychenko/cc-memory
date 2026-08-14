import type { AbsPath } from "@/core/core.typedefs.ts";
import { HOME_ALIAS } from "@/core/utils/paths/paths.constants.ts";

/**
 * Collapse redundant `.`/`..`/duplicate-slash segments the way `os.path.normpath`
 * does for POSIX paths (this project only ever runs on macOS/Linux). Does not
 * touch a leading `~` — callers expand that first.
 */
function normalize(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments = path.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const last = stack.at(-1);
      if (last !== undefined && last !== "..") {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push("..");
      }
      continue;
    }
    stack.push(segment);
  }
  const joined = stack.join("/");
  if (isAbsolute) return `/${joined}`;
  return joined === "" ? "." : joined;
}

/**
 * Expand a leading `~` (and only a leading `~`) against `home`, then normalize.
 * This is the sole constructor of `AbsPath` — the ONE place a type assertion is
 * allowed.
 *
 * `home` arrives as a parameter rather than being read from the environment:
 * domain code has no I/O, so callers (services) resolve `$HOME` and pass it in.
 */
export function expandPath(path: string, home: AbsPath): AbsPath {
  const expanded =
    path === HOME_ALIAS || path.startsWith(`${HOME_ALIAS}/`)
      ? home + path.slice(1)
      : path;
  // SAFETY: `normalize` never introduces a leading `~`, and every caller of
  // `expandPath` supplies either an absolute path or one anchored at `home`
  // (itself an `AbsPath`), so the result is always an absolute, normalized path.
  return normalize(expanded) as AbsPath;
}

/**
 * Collapse `$HOME` back to `~` for tidy registry storage.
 * The exact-match case (`p === home`) must be checked before the prefix case, or
 * a workspace whose path *is* the home directory would fall through unchanged.
 */
export function tildify(path: AbsPath, home: AbsPath): string {
  if (path === home) return HOME_ALIAS;
  if (path.startsWith(`${home}/`)) return HOME_ALIAS + path.slice(home.length);
  return path;
}

/** True when `child` is `parent` itself or a path strictly nested under it. */
export function isUnder(child: AbsPath, parent: AbsPath): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * Path relative to `base` with the `.md` extension stripped — the FTS index's
 * link-resolution key. Falls back to the path unchanged when it isn't under
 * `base` at all.
 */
export function relKey(path: AbsPath, base: AbsPath): string {
  const relative = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  return relative.endsWith(".md") ? relative.slice(0, -3) : relative;
}
