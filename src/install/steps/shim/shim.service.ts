import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import {
  SHIM_HOME_RELATIVE_PATH,
  SHIM_MODE,
} from "@/install/steps/shim/shim.constants.ts";
import type { FileSystem } from "@/platform/index.ts";

/**
 * `~/.local/bin/memory` — a 2-line `sh` shim with ABSOLUTE paths baked in.
 *
 * A symlink to a `.js` file isn't executable on its own, and
 * `#!/usr/bin/env bun` would only resolve when `bun` happens to be on the
 * caller's `PATH` — which is not guaranteed for a process spawned by another
 * tool. Baking in the absolute interpreter path makes the shim work from any
 * environment.
 */
export class ShimService {
  constructor(private readonly fs: FileSystem) {}

  static defaultPath(home: AbsPath): AbsPath {
    return expandPath(SHIM_HOME_RELATIVE_PATH, home);
  }

  static content(bunPath: string, distPath: string): string {
    return `#!/bin/sh\nexec ${bunPath} ${distPath} "$@"\n`;
  }

  /** The parent directory of an already-absolute, normalized `AbsPath` — see
   * `registry.service.ts`'s `parentDir` doc comment for why this tiny helper
   * has no shared home in the codebase. */
  private static parentDirectory(path: AbsPath): AbsPath {
    const lastSlashIndex = path.lastIndexOf("/");
    const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
    // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
    // another absolute, normalized path (or the root `/`).
    return sliced as AbsPath;
  }

  /**
   * Write the shim, `chmod +x`. `fs.remove` runs first and unconditionally
   * (idempotent on a missing path, per `fileSystem.typedefs.ts`): `writeFile`
   * opens a path THROUGH a symlink, so writing directly over a pre-existing
   * `~/.local/bin/memory` symlink would silently overwrite whatever it
   * pointed at with shim text instead of replacing the link itself. Removing
   * first guarantees a fresh regular file every time.
   */
  async write(shimPath: AbsPath, bunPath: string, distPath: string): Promise<void> {
    await this.fs.mkdir(ShimService.parentDirectory(shimPath));
    await this.fs.remove(shimPath);
    await this.fs.writeFile(shimPath, ShimService.content(bunPath, distPath));
    await this.fs.chmod(shimPath, SHIM_MODE);
  }
}
