import type { AbsPath } from "../core/AbsPath.ts";
import type { Result } from "../core/Result.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import type { Proc } from "../platform/proc.port.ts";

/**
 * Resolve the REAL `bun` binary at install time — never the ephemeral path a
 * version manager hands out. The live machine has 4,386 stale `fnm`
 * multishell directories on disk from Node version switching; the equivalent
 * failure mode for `bun` would be recording today's `which bun` answer
 * verbatim and having it rot the moment a shell/session that created it
 * exits. `readlink -f` walks every symlink hop (the shim `fnm`/`asdf`/a
 * version manager would install) down to the one real file, which is what
 * gets written into `settings.json` and the `~/.local/bin/memory` shim.
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
 * guessing on any failure along the way (`[[reference]]`/packet-9-install's
 * "never record an ephemeral path"). */
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
