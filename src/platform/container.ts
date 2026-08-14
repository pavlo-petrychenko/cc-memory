import { type EnvSnapshot, parseConfig } from "../core/Config.ts";
import { expandPath } from "../core/paths.ts";
import { makeClockAdapter } from "./clock.adapter.ts";
import type { Clock } from "./clock.typedefs.ts";
import { makeDatabaseAdapter } from "./database.adapter.ts";
import type { SqlDatabase } from "./database.typedefs.ts";
import { makeEnvAdapter } from "./env.adapter.ts";
import type { Env } from "./env.typedefs.ts";
import { makeFileSystemAdapter } from "./fileSystem.adapter.ts";
import type { FileSystem } from "./fileSystem.typedefs.ts";
import { makeGitAdapter } from "./git.adapter.ts";
import type { Git } from "./git.typedefs.ts";
import { makeLoggerAdapter } from "./logger.adapter.ts";
import type { Logger } from "./logger.typedefs.ts";
import { makeProcAdapter } from "./proc.adapter.ts";
import type { Proc } from "./proc.typedefs.ts";
import { makeStdioAdapter } from "./stdio.adapter.ts";
import type { Stdio } from "./stdio.typedefs.ts";

/**
 * Every port the codebase needs, bundled. `cli/main.ts` and `hooks/runtime.ts`
 * are the only places that build the real one (`makeRealContainer`); everything
 * else (services, domain) receives a `Container` as a parameter, so a test can
 * pass `tests/helpers/container.ts`'s `makeTestContainer` instead.
 *
 * `openDatabase` is a factory rather than a single field: the index database path is
 * per-workspace, so there is no single "the" database to bundle at
 * container-build time. It still guarantees one handle per process: calling it
 * twice with the same path returns the SAME open handle, so a run that does
 * notes search + worklog search + inlink counts against one workspace shares
 * one connection.
 */
export type Container = {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly openDatabase: (path: string) => SqlDatabase;
  readonly stdio: Stdio;
};

// A literal `~/`-prefix (not a bare relative path) is required here: `expandPath`
// only expands a LEADING `~`, so this is what makes the result land under $HOME
// rather than under whatever the process's cwd happens to be.
const LOG_FILE_HOME_RELATIVE_PATH = "~/.claude/memory/ccmem.log";

/**
 * Build the real `Container`: real filesystem, real `git`/subprocess, the real
 * clock, the real environment, a rotating file logger, and a memoizing SQLite
 * opener. `envSnapshot` is only consulted for `CCMEM_LOG_LEVEL` (via
 * `parseConfig`) to set the logger's threshold — every other port reads the
 * live process directly, matching `EnvSnapshot`'s role as a boundary-parsed
 * value rather than something threaded through every adapter.
 */
export function makeRealContainer(envSnapshot: EnvSnapshot): Container {
  const env = makeEnvAdapter();
  const proc = makeProcAdapter();
  const config = parseConfig(envSnapshot);
  const logPath = expandPath(LOG_FILE_HOME_RELATIVE_PATH, env.home());
  const dbHandles = new Map<string, SqlDatabase>();

  return {
    fs: makeFileSystemAdapter(),
    git: makeGitAdapter(proc),
    proc,
    clock: makeClockAdapter(),
    env,
    logger: makeLoggerAdapter(logPath, config.logLevel),
    openDatabase: (path: string) => {
      const existing = dbHandles.get(path);
      if (existing !== undefined) return existing;
      const db = makeDatabaseAdapter(path);
      dbHandles.set(path, db);
      return db;
    },
    stdio: makeStdioAdapter(),
  };
}
