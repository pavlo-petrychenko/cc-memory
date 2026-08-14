import type { AbsPath } from "../../core/AbsPath.ts";
import type { Env } from "../../platform/env.typedefs.ts";

export type EnvFake = Env & {
  readonly set: (name: string, value: string) => void;
  readonly unset: (name: string) => void;
  readonly setHome: (value: AbsPath) => void;
  readonly setCwd: (value: AbsPath) => void;
};

/**
 * An `Env` backed by a plain `Map`, so a test sets `CCMEM_*` vars and a fake
 * `$HOME`/cwd without touching the real process environment.
 */
export function makeEnvFake(home: AbsPath, cwd: AbsPath): EnvFake {
  const vars = new Map<string, string>();
  let homePath = home;
  let cwdPath = cwd;

  return {
    get: (name: string) => vars.get(name),
    home: () => homePath,
    cwd: () => cwdPath,
    set: (name: string, value: string) => {
      vars.set(name, value);
    },
    unset: (name: string) => {
      vars.delete(name);
    },
    setHome: (value: AbsPath) => {
      homePath = value;
    },
    setCwd: (value: AbsPath) => {
      cwdPath = value;
    },
  };
}
