import type { AbsPath } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import type { Proc } from "@/gateways/index.ts";
import {
  READLINK_TIMEOUT_MS,
  WHICH_TIMEOUT_MS,
} from "@/install/steps/bunPath/bunPath.constants.ts";
import {
  type BunPathError,
  BunPathErrorKind,
} from "@/install/steps/bunPath/bunPath.typedefs.ts";

/** Resolves the REAL `bun` binary at install time — never the ephemeral path a
 * version manager (`fnm`, `asdf`, ...) hands out via a per-session `PATH` shim.
 * `readlink -f` walks every symlink hop down to the one real file. */
export class BunPathService {
  constructor(
    private readonly proc: Proc,
    private readonly fs: FileSystem,
  ) {}

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

    const absoluteResolvedPath = absPath(resolvedPath);
    if (!(await this.fs.exists(absoluteResolvedPath))) {
      return {
        ok: false,
        error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: resolvedPath },
      };
    }
    return { ok: true, value: absoluteResolvedPath };
  }
}
