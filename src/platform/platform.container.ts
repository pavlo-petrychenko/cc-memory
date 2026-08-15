import { ConfigParser, type EnvSnapshot } from "@/core/index.ts";
import { logPath } from "@/core/index.ts";
import { ClockAdapter } from "@/platform/clock/clock.adapter.ts";
import type { Clock } from "@/platform/clock/clock.typedefs.ts";
import { EnvAdapter } from "@/platform/env/env.adapter.ts";
import type { Env } from "@/platform/env/env.typedefs.ts";
import { FileSystemAdapter } from "@/platform/fileSystem/fileSystem.adapter.ts";
import type { FileSystem } from "@/platform/fileSystem/fileSystem.typedefs.ts";
import { GitAdapter } from "@/platform/git/git.adapter.ts";
import type { Git } from "@/platform/git/git.typedefs.ts";
import { LoggerAdapter } from "@/platform/logger/logger.adapter.ts";
import type { Logger } from "@/platform/logger/logger.typedefs.ts";
import type { Container } from "@/platform/platform.typedefs.ts";
import { ProcAdapter } from "@/platform/proc/proc.adapter.ts";
import type { Proc } from "@/platform/proc/proc.typedefs.ts";
import { SqliteAdapter } from "@/platform/sqlite/sqlite.adapter.ts";
import type { Sqlite } from "@/platform/sqlite/sqlite.typedefs.ts";
import { StdioAdapter } from "@/platform/stdio/stdio.adapter.ts";
import type { Stdio } from "@/platform/stdio/stdio.typedefs.ts";

/** Builds the real `Container`. `envSnapshot` is only consulted for
 * `CCMEM_LOG_LEVEL` to set the logger's threshold — every other port reads the
 * live process directly. */
export class AppContainer implements Container {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly stdio: Stdio;
  private readonly dbHandles = new Map<string, Sqlite>();

  constructor(envSnapshot: EnvSnapshot) {
    this.env = new EnvAdapter();
    this.proc = new ProcAdapter();
    const config = new ConfigParser().parse(envSnapshot);
    const resolvedLogPath = logPath(this.env.home());

    this.fs = new FileSystemAdapter();
    this.git = new GitAdapter(this.proc);
    this.clock = new ClockAdapter();
    this.logger = new LoggerAdapter(resolvedLogPath, config.logLevel);
    this.stdio = new StdioAdapter();
  }

  openDatabase(path: string): Sqlite {
    const existing = this.dbHandles.get(path);
    if (existing !== undefined) return existing;
    const db = new SqliteAdapter(path);
    this.dbHandles.set(path, db);
    return db;
  }
}
