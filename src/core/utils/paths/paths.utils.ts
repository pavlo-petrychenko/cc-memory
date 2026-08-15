import type { AbsPath, Result } from "@/core/core.typedefs.ts";
import {
  CCMEM_LOG_FILENAME,
  CCMEM_HOME,
  HOME_ALIAS,
  INDEX_DB_FILENAME,
  INJECT_LOG_FILENAME,
  MANIFEST_FILENAME,
  REGISTRY_FILENAME,
} from "@/core/utils/paths/paths.constants.ts";
import type { PathError } from "@/core/utils/paths/paths.typedefs.ts";
import { PathErrorKind } from "@/core/utils/paths/paths.typedefs.ts";

function unsafeAbsPath(value: string): AbsPath {
  // SAFETY: every call site in this file has already established `value` is
  // absolute — either by checking it (`tryAbsPath`) or by construction
  // (normalizing an expanded path, slicing at a `/` boundary, appending a
  // literal segment onto an already-absolute base).
  return value as AbsPath;
}

export function tryAbsPath(value: string): Result<AbsPath, PathError> {
  if (!value.startsWith("/")) {
    return { ok: false, error: { kind: PathErrorKind.NotAbsolute, value } };
  }
  return { ok: true, value: unsafeAbsPath(value) };
}

/** Throws instead of returning `Result` for cases this codebase's own invariants
 * already guarantee are absolute — `$HOME`, a resolved `readlink`, an index column. */
export function absPath(value: string): AbsPath {
  const result = tryAbsPath(value);
  if (!result.ok) {
    throw new Error(`not an absolute path: ${value}`);
  }
  return result.value;
}

/** Collapses `.`/`..`/duplicate slashes like `os.path.normpath` for POSIX paths.
 * Does not touch a leading `~` — callers expand that first. */
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

/** Expands a leading `~` against `home`, then normalizes. */
export function expandPath(path: string, home: AbsPath): AbsPath {
  const expanded =
    path === HOME_ALIAS || path.startsWith(`${HOME_ALIAS}/`)
      ? home + path.slice(1)
      : path;
  return unsafeAbsPath(normalize(expanded));
}

/** Collapses `$HOME` back to `~` for registry storage. The exact-match check must
 * come before the prefix check, or a workspace whose path *is* home falls through. */
export function tildify(path: AbsPath, home: AbsPath): string {
  if (path === home) return HOME_ALIAS;
  if (path.startsWith(`${home}/`)) return HOME_ALIAS + path.slice(home.length);
  return path;
}

export function isUnder(child: AbsPath, parent: AbsPath): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/** `path` relative to `base` with `.md` stripped — the FTS index's link-resolution key. */
export function relKey(path: AbsPath, base: AbsPath): string {
  const relative = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  return relative.endsWith(".md") ? relative.slice(0, -3) : relative;
}

export function relativeTo(path: string, base: string): string {
  const prefix = `${base}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function parentDir(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  return unsafeAbsPath(sliced);
}

/** `base` is treated as ending in `/` when it's the filesystem root, so
 * `joinAbs(rootPath, "x")` yields `/x` rather than `//x`. */
export function joinAbs(base: AbsPath, ...segments: readonly string[]): AbsPath {
  if (segments.length === 0) return base;
  const separator = base.endsWith("/") ? "" : "/";
  return unsafeAbsPath(`${base}${separator}${segments.join("/")}`);
}

export function registryPath(home: AbsPath): AbsPath {
  return expandPath(`${CCMEM_HOME}/${REGISTRY_FILENAME}`, home);
}

export function indexDbPath(home: AbsPath, id: string): AbsPath {
  return expandPath(`${CCMEM_HOME}/${id}/${INDEX_DB_FILENAME}`, home);
}

export function manifestPath(home: AbsPath): AbsPath {
  return expandPath(`${CCMEM_HOME}/${MANIFEST_FILENAME}`, home);
}

export function logPath(home: AbsPath): AbsPath {
  return expandPath(`${CCMEM_HOME}/${CCMEM_LOG_FILENAME}`, home);
}

export function injectLogPath(home: AbsPath, id: string): AbsPath {
  return expandPath(`${CCMEM_HOME}/${id}/${INJECT_LOG_FILENAME}`, home);
}
