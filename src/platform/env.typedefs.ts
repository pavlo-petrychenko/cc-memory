import type { AbsPath } from "../core/AbsPath.ts";

/**
 * The process environment, as a seam: `$HOME`, `$PWD` and every `CCMEM_*`
 * tunable are read through here rather than `process.env`/`Bun.env` directly,
 * so a test supplies a `fakes/envMap.fake.ts` instead of mutating the real
 * process environment.
 */
export type Env = {
  readonly get: (name: string) => string | undefined;
  /** The home directory, already an `AbsPath`. */
  readonly home: () => AbsPath;
  /** The current working directory. */
  readonly cwd: () => AbsPath;
};
