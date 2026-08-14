import { type EnvSnapshot, parseConfig } from "../core/Config.ts";
import { expandPath } from "../core/paths.ts";
import type { Clock } from "./clock.port.ts";
import { makeClockRealAdapter } from "./clockReal.adapter.ts";
import type { Db } from "./db.port.ts";
import { makeDbBunSqliteAdapter } from "./dbBunSqlite.adapter.ts";
import type { Env } from "./env.port.ts";
import { makeEnvProcessAdapter } from "./envProcess.adapter.ts";
import type { FileSystem } from "./fileSystem.port.ts";
import { makeFsRealAdapter } from "./fsReal.adapter.ts";
import type { Git } from "./git.port.ts";
import { makeGitCliAdapter } from "./gitCli.adapter.ts";
import { makeIoProcessAdapter } from "./ioProcess.adapter.ts";
import type { Logger } from "./logger.port.ts";
import { makeLoggerFileAdapter } from "./loggerFile.adapter.ts";
import type { Proc } from "./proc.port.ts";
import { makeProcRealAdapter } from "./procReal.adapter.ts";
import type { Stdio } from "./stdio.port.ts";

/**
 * Every port the codebase needs, bundled. `cli/main.ts` and `hooks/runtime.ts`
 * are the only places that build the real one (`makeRealContainer`); everything
 * else (services, domain) receives a `Container` as a parameter, so a test can
 * pass `tests/helpers/container.ts`'s `makeTestContainer` instead.
 *
 * `openDb` is a factory rather than a single field: the index database path is
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
