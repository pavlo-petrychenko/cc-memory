import type { AbsPath } from "@/core/index.ts";

/** A seam: `$HOME`, `$PWD` and every `CCMEM_*` tunable are read through here
 * rather than `process.env`/`Bun.env` directly, so a test supplies a
 * `fakes/envMap.fake.ts` instead of mutating the real process environment. */
export type Env = {
  readonly get: (name: string) => string | undefined;
  readonly home: () => AbsPath;
  readonly cwd: () => AbsPath;
  /** Derived from where the running file physically sits. Only correct for the
   * bundled artifact (`dist/memory.js`); install/doctor are the only callers. */
  readonly repoRoot: () => AbsPath;
};
