import { homedir } from "node:os";

import type { AbsPath } from "@/core/index.ts";
import type { Env } from "@/platform/env/env.typedefs.ts";

/**
 * The real `Env`, reading the actual process for the home directory and cwd.
 *
 * SAFETY: `os.homedir()`/`process.cwd()` are always absolute, and the OS never
 * hands back a path needing further normalization here — this is the only place
 * outside `core/utils/paths/paths.utils.ts` an `AbsPath` cast is warranted, because
 * there is no relative or `~`-prefixed input to run through `expandPath`.
 */
export class EnvAdapter implements Env {
  get(name: string): string | undefined {
    return process.env[name];
  }

  home(): AbsPath {
    // SAFETY: `os.homedir()` always returns an absolute, OS-native path — no
    // `~`/relative segment to normalize.
    return homedir() as AbsPath;
  }

  cwd(): AbsPath {
    // SAFETY: `process.cwd()` always returns an absolute, OS-native path, same
    // reasoning as `home()` above.
    return process.cwd() as AbsPath;
  }
}
