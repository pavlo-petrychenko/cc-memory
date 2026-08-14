import { homedir } from "node:os";

import type { AbsPath } from "../domain/AbsPath.ts";
import type { Env } from "../ports/env.port.ts";

/**
 * The real `Env`, reading the actual process — `os.path.expanduser("~")`
 * (`registry.py:12,17-19`) and `os.getcwd()` (`bin/memory`, every hook's
 * `payload.get("cwd") or os.getcwd()`).
 *
 * SAFETY: `os.homedir()`/`process.cwd()` are always absolute, and the OS never
 * hands back a path needing further normalization here — this is the only place
 * outside `domain/paths.ts` an `AbsPath` cast is warranted, because there is no
 * relative or `~`-prefixed input to run through `expandPath`.
 */
export function makeEnvProcessAdapter(): Env {
  return {
    get: (name: string) => process.env[name],
    home: () => {
      // SAFETY: `os.homedir()` always returns an absolute, OS-native path — no
      // `~`/relative segment to normalize, unlike the vault/registry strings
      // `domain/paths.ts`'s `expandPath` handles.
      return homedir() as AbsPath;
    },
    cwd: () => {
      // SAFETY: `process.cwd()` always returns an absolute, OS-native path, same
      // reasoning as `home()` above.
      return process.cwd() as AbsPath;
    },
  };
}
