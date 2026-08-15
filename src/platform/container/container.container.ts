import { ConfigParser, type EnvSnapshot } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import { ClockAdapter } from "@/platform/clock/index.ts";
import type { Clock } from "@/platform/clock/index.ts";
import { LOG_FILE_HOME_RELATIVE_PATH } from "@/platform/container/container.constants.ts";
import type { Container } from "@/platform/container/container.typedefs.ts";
import { DatabaseAdapter } from "@/platform/db/index.ts";
import type { SqlDatabase } from "@/platform/db/index.ts";
import { EnvAdapter } from "@/platform/env/index.ts";
import type { Env } from "@/platform/env/index.ts";
import { FileSystemAdapter } from "@/platform/fileSystem/index.ts";
import type { FileSystem } from "@/platform/fileSystem/index.ts";
import { GitAdapter } from "@/platform/git/index.ts";
import type { Git } from "@/platform/git/index.ts";
import { LoggerAdapter } from "@/platform/logger/index.ts";
import type { Logger } from "@/platform/logger/index.ts";
import { ProcAdapter } from "@/platform/proc/index.ts";
import type { Proc } from "@/platform/proc/index.ts";
import { StdioAdapter } from "@/platform/stdio/index.ts";
import type { Stdio } from "@/platform/stdio/index.ts";

/**
 * Build the real `Container`: real filesystem, real `git`/subprocess, the real
 * clock, the real environment, a rotating file logger, and a memoizing SQLite
 * opener. `envSnapshot` is only consulted for `CCMEM_LOG_LEVEL` (via
 * `ConfigParser.parse`) to set the logger's threshold — every other port reads the
 * live process directly, matching `EnvSnapshot`'s role as a boundary-parsed
 * value rather than something threaded through every adapter.
 */
export class AppContainer implements Container {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly stdio: Stdio;
  private readonly dbHandles = new Map<string, SqlDatabase>();

  constructor(envSnapshot: EnvSnapshot) {
    this.env = new EnvAdapter();
    this.proc = new ProcAdapter();
    const config = new ConfigParser().parse(envSnapshot);
    const logPath = expandPath(LOG_FILE_HOME_RELATIVE_PATH, this.env.home());

    this.fs = new FileSystemAdapter();
    this.git = new GitAdapter(this.proc);
    this.clock = new ClockAdapter();
    this.logger = new LoggerAdapter(logPath, config.logLevel);
    this.stdio = new StdioAdapter();
  }

  openDatabase(path: string): SqlDatabase {
    const existing = this.dbHandles.get(path);
    if (existing !== undefined) return existing;
    const db = new DatabaseAdapter(path);
    this.dbHandles.set(path, db);
    return db;
  }
}
