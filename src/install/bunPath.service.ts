import type { AbsPath } from "../core/AbsPath.ts";
import type { Result } from "../core/Result.ts";
import type { FileSystem } from "../platform/fileSystem.typedefs.ts";
import type { Proc } from "../platform/proc.typedefs.ts";

/**
 * Resolve the REAL `bun` binary at install time — never the ephemeral path a
 * version manager hands out. A naive `which bun` answer can rot the moment
 * the shell/session that produced it exits, if a version manager (`fnm`,
 * `asdf`, ...) put a per-session shim on `PATH`. `readlink -f` walks every
 * symlink hop such a shim would install down to the one real file, which is
 * what gets written into `settings.json` and the `~/.local/bin/memory` shim.
 */

const WHICH_TIMEOUT_MS = 5_000;
const READLINK_TIMEOUT_MS = 5_000;

export enum BunPathErrorKind {
  /** `which bun` found nothing on `$PATH`. */
  NotFound = "not_found",
  /** `readlink -f` failed, or the path it printed doesn't exist on disk —
   * either way, refuse rather than record something ephemeral. */
  Unresolvable = "unresolvable",
}

export type BunPathError =
  | { readonly kind: BunPathErrorKind.NotFound }
  | { readonly kind: BunPathErrorKind.Unresolvable; readonly attemptedPath: string };

/** `readlink -f $(which bun)`, verified to exist — refuses rather than
 * guessing on any failure along the way, never recording an ephemeral path. */
export async function resolveBunPath(
  proc: Proc,
  fs: FileSystem,
): Promise<Result<AbsPath, BunPathError>> {
  const which = await proc.run("which", ["bun"], { timeoutMs: WHICH_TIMEOUT_MS });
  const whichPath = which.stdout.trim();
  if (which.exitCode !== 0 || whichPath === "") {
    return { ok: false, error: { kind: BunPathErrorKind.NotFound } };
  }

  const readlink = await proc.run("readlink", ["-f", whichPath], {
    timeoutMs: READLINK_TIMEOUT_MS,
  });
  const resolvedPath = readlink.stdout.trim();
  if (readlink.exitCode !== 0 || resolvedPath === "") {
    return {
      ok: false,
      error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: whichPath },
    };
  }

  // SAFETY: `readlink -f` always prints an absolute, fully-resolved path (its
  // one job); this is the sole trust boundary that turns a `Proc` stdout
  // string into an `AbsPath` for the installer.
  const absoluteResolvedPath = resolvedPath as AbsPath;
  if (!(await fs.exists(absoluteResolvedPath))) {
    return {
      ok: false,
      error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: resolvedPath },
    };
  }
  return { ok: true, value: absoluteResolvedPath };
}
