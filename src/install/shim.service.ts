import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { FileSystem } from "../platform/fileSystem.typedefs.ts";

/**
 * `~/.local/bin/memory` — a 2-line `sh` shim with ABSOLUTE paths baked in.
 *
 * A symlink to a `.js` file isn't executable on its own, and
 * `#!/usr/bin/env bun` would only resolve when `bun` happens to be on the
 * caller's `PATH` — which is not guaranteed for a process spawned by another
 * tool. Baking in the absolute interpreter path makes the shim work from any
 * environment.
 */

const SHIM_HOME_RELATIVE_PATH = "~/.local/bin/memory";
const SHIM_MODE = 0o755;

export function defaultShimPath(home: AbsPath): AbsPath {
  return expandPath(SHIM_HOME_RELATIVE_PATH, home);
}

export function shimContent(bunPath: string, distPath: string): string {
  return `#!/bin/sh\nexec ${bunPath} ${distPath} "$@"\n`;
}

/** The parent directory of an already-absolute, normalized `AbsPath` — see
 * `registry.service.ts`'s `parentDir` doc comment for why this tiny helper
 * has no shared home in the codebase. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path (or the root `/`).
  return sliced as AbsPath;
}

/**
 * Write the shim, `chmod +x`. `fs.remove` runs first and unconditionally
 * (idempotent on a missing path, per `fileSystem.typedefs.ts`): `writeFile` opens
 * a path THROUGH a symlink, so writing directly over a pre-existing
 * `~/.local/bin/memory` symlink would silently overwrite whatever it pointed
 * at with shim text instead of replacing the link itself. Removing first
 * guarantees a fresh regular file every time.
 */
export async function writeShim(
  fs: FileSystem,
  shimPath: AbsPath,
  bunPath: string,
  distPath: string,
): Promise<void> {
  await fs.mkdir(parentDirectory(shimPath));
  await fs.remove(shimPath);
  await fs.writeFile(shimPath, shimContent(bunPath, distPath));
  await fs.chmod(shimPath, SHIM_MODE);
}
