import { homedir } from "node:os";

import type { AbsPath } from "../core/AbsPath.ts";
import type { Env } from "./env.typedefs.ts";

/**
 * The real `Env`, reading the actual process for the home directory and cwd.
 *
 * SAFETY: `os.homedir()`/`process.cwd()` are always absolute, and the OS never
 * hands back a path needing further normalization here — this is the only place
 * outside `core/paths.ts` an `AbsPath` cast is warranted, because there is no
 * relative or `~`-prefixed input to run through `expandPath`.
 */
export function makeEnvAdapter(): Env {
  return {
    get: (name: string) => process.env[name],
    home: () => {
      // SAFETY: `os.homedir()` always returns an absolute, OS-native path — no
      // `~`/relative segment to normalize.
      return homedir() as AbsPath;
    },
    cwd: () => {
      // SAFETY: `process.cwd()` always returns an absolute, OS-native path, same
      // reasoning as `home()` above.
      return process.cwd() as AbsPath;
    },
  };
}
