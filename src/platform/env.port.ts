import type { AbsPath } from "../core/AbsPath.ts";

/**
 * The process environment, as a seam: `$HOME`, `$PWD` and every `CCMEM_*`
 * tunable (C5) are read through here rather than `process.env`/`Bun.env`
 * directly, so a test supplies a `fakes/envMap.fake.ts` instead of mutating the
 * real process environment (`registry.py:12`'s `os.path.expanduser("~")`,
 * `bin/memory`'s `os.getcwd()`, and every `os.environ.get("CCMEM_...")` this
 * project reads).
 */
export type Env = {
  readonly get: (name: string) => string | undefined;
  /** `os.path.expanduser("~")` — the home directory, already an `AbsPath`. */
  readonly home: () => AbsPath;
  /** `os.getcwd()`. */
  readonly cwd: () => AbsPath;
};
