import { makeClockRealAdapter } from "./adapters/clockReal.adapter.ts";
import { makeDbBunSqliteAdapter } from "./adapters/dbBunSqlite.adapter.ts";
import { makeEnvProcessAdapter } from "./adapters/envProcess.adapter.ts";
import { makeFsRealAdapter } from "./adapters/fsReal.adapter.ts";
import { makeGitCliAdapter } from "./adapters/gitCli.adapter.ts";
import { makeIoProcessAdapter } from "./adapters/ioProcess.adapter.ts";
import { makeLoggerFileAdapter } from "./adapters/loggerFile.adapter.ts";
import { makeProcRealAdapter } from "./adapters/procReal.adapter.ts";
import { type EnvSnapshot, parseConfig } from "./domain/Config.ts";
import { expandPath } from "./domain/paths.ts";
import type { Clock } from "./ports/clock.port.ts";
import type { Db } from "./ports/db.port.ts";
import type { Env } from "./ports/env.port.ts";
import type { FileSystem } from "./ports/fileSystem.port.ts";
import type { Git } from "./ports/git.port.ts";
import type { Logger } from "./ports/logger.port.ts";
import type { Proc } from "./ports/proc.port.ts";
import type { Stdio } from "./ports/stdio.port.ts";

/**
 * Every port the codebase needs, bundled. `cli/main.ts` and `hooks/runtime.ts`
 * are the only places that build the real one (`makeRealContainer`); everything
 * else (services, domain) receives a `Container` as a parameter, so a test can
 * pass `tests/helpers/container.ts`'s `makeTestContainer` instead.
 *
 * `openDb` is a factory rather than a single field: `index_db` is one path PER
 * WORKSPACE, so there is no single "the" database to bundle at container-build
 * time. It still satisfies "one handle per process" ([[bugfixes]] #6): calling it
 * twice with the same path returns the SAME open handle, so a run that does
 * notes search + worklog search + inlink counts against one workspace shares one
 * connection instead of `lib/index.py`'s three.
 */
export type Container = {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly openDb: (path: string) => Db;
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
  const env = makeEnvProcessAdapter();
  const proc = makeProcRealAdapter();
  const config = parseConfig(envSnapshot);
  const logPath = expandPath(LOG_FILE_HOME_RELATIVE_PATH, env.home());
  const dbHandles = new Map<string, Db>();

  return {
    fs: makeFsRealAdapter(),
    git: makeGitCliAdapter(proc),
    proc,
    clock: makeClockRealAdapter(),
    env,
    logger: makeLoggerFileAdapter(logPath, config.logLevel),
    openDb: (path: string) => {
      const existing = dbHandles.get(path);
      if (existing !== undefined) return existing;
      const db = makeDbBunSqliteAdapter(path);
      dbHandles.set(path, db);
      return db;
    },
    stdio: makeIoProcessAdapter(),
  };
}
