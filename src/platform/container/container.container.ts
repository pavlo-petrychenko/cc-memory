import { type EnvSnapshot, parseConfig } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import { makeClockAdapter } from "@/platform/clock/index.ts";
import { LOG_FILE_HOME_RELATIVE_PATH } from "@/platform/container/container.constants.ts";
import type { Container } from "@/platform/container/container.typedefs.ts";
import { makeDatabaseAdapter, type SqlDatabase } from "@/platform/db/index.ts";
import { makeEnvAdapter } from "@/platform/env/index.ts";
import { makeFileSystemAdapter } from "@/platform/fileSystem/index.ts";
import { makeGitAdapter } from "@/platform/git/index.ts";
import { makeLoggerAdapter } from "@/platform/logger/index.ts";
import { makeProcAdapter } from "@/platform/proc/index.ts";
import { makeStdioAdapter } from "@/platform/stdio/index.ts";

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
