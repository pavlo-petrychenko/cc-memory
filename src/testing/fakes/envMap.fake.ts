import type { AbsPath } from "@/core/index.ts";
import type { Env } from "@/platform/index.ts";

export type EnvFake = Env & {
  readonly set: (name: string, value: string) => void;
  readonly unset: (name: string) => void;
  readonly setHome: (value: AbsPath) => void;
  readonly setCwd: (value: AbsPath) => void;
  readonly setRepoRoot: (value: AbsPath) => void;
};

/** An `Env` backed by a plain `Map`, so a test sets `CCMEM_*` vars and a fake
 * `$HOME`/cwd/repo root without touching the real process environment. */
export function makeEnvFake(home: AbsPath, cwd: AbsPath, repoRoot: AbsPath): EnvFake {
  const vars = new Map<string, string>();
  let homePath = home;
  let cwdPath = cwd;
  let repoRootPath = repoRoot;

  return {
    get: (name: string) => vars.get(name),
    home: () => homePath,
    cwd: () => cwdPath,
    repoRoot: () => repoRootPath,
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
    setRepoRoot: (value: AbsPath) => {
      repoRootPath = value;
    },
  };
}
