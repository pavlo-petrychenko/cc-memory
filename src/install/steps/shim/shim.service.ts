import type { AbsPath } from "@/core/index.ts";
import { expandPath, parentDir } from "@/core/index.ts";
import {
  SHIM_HOME_RELATIVE_PATH,
  SHIM_MODE,
} from "@/install/steps/shim/shim.constants.ts";
import type { FileSystem } from "@/platform/index.ts";

/** `~/.local/bin/memory` — a 2-line `sh` shim with ABSOLUTE paths baked in, since
 * `#!/usr/bin/env bun` would only resolve when `bun` is on the caller's `PATH`,
 * which isn't guaranteed for a process spawned by another tool. */
export class ShimService {
  constructor(private readonly fs: FileSystem) {}

  static defaultPath(home: AbsPath): AbsPath {
    return expandPath(SHIM_HOME_RELATIVE_PATH, home);
  }

  static content(bunPath: string, distPath: string): string {
    return `#!/bin/sh\nexec ${bunPath} ${distPath} "$@"\n`;
  }

  /** `fs.remove` runs first: `writeFile` opens a path THROUGH a symlink, so writing
   * directly over a pre-existing shim symlink would silently overwrite whatever it
   * pointed at instead of replacing the link itself. */
  async write(shimPath: AbsPath, bunPath: string, distPath: string): Promise<void> {
    await this.fs.mkdir(parentDir(shimPath));
    await this.fs.remove(shimPath);
    await this.fs.writeFile(shimPath, ShimService.content(bunPath, distPath));
    await this.fs.chmod(shimPath, SHIM_MODE);
  }
}
