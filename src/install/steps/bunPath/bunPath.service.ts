import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  READLINK_TIMEOUT_MS,
  WHICH_TIMEOUT_MS,
} from "@/install/steps/bunPath/bunPath.constants.ts";
import {
  type BunPathError,
  BunPathErrorKind,
} from "@/install/steps/bunPath/bunPath.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";
import type { Proc } from "@/platform/index.ts";

/**
 * Resolve the REAL `bun` binary at install time — never the ephemeral path a
 * version manager hands out. A naive `which bun` answer can rot the moment
 * the shell/session that produced it exits, if a version manager (`fnm`,
 * `asdf`, ...) put a per-session shim on `PATH`. `readlink -f` walks every
 * symlink hop such a shim would install down to the one real file, which is
 * what gets written into `settings.json` and the `~/.local/bin/memory` shim.
 */
export class BunPathService {
  constructor(
    private readonly proc: Proc,
    private readonly fs: FileSystem,
  ) {}

  /** `readlink -f $(which bun)`, verified to exist — refuses rather than
   * guessing on any failure along the way, never recording an ephemeral path. */
  async resolve(): Promise<Result<AbsPath, BunPathError>> {
    const which = await this.proc.run("which", ["bun"], {
      timeoutMs: WHICH_TIMEOUT_MS,
    });
    const whichPath = which.stdout.trim();
    if (which.exitCode !== 0 || whichPath === "") {
      return { ok: false, error: { kind: BunPathErrorKind.NotFound } };
    }

    const readlink = await this.proc.run("readlink", ["-f", whichPath], {
      timeoutMs: READLINK_TIMEOUT_MS,
    });
    const resolvedPath = readlink.stdout.trim();
    if (readlink.exitCode !== 0 || resolvedPath === "") {
      return {
        ok: false,
        error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: whichPath },
      };
    }

    // SAFETY: `readlink -f` always prints an absolute, fully-resolved path
    // (its one job); this is the sole trust boundary that turns a `Proc`
    // stdout string into an `AbsPath` for the installer.
    const absoluteResolvedPath = resolvedPath as AbsPath;
    if (!(await this.fs.exists(absoluteResolvedPath))) {
      return {
        ok: false,
        error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: resolvedPath },
      };
    }
    return { ok: true, value: absoluteResolvedPath };
  }
}
