import { ConfigParser, type EnvSnapshot } from "@/core/index.ts";
import { logPath } from "@/core/index.ts";
import { ClockAdapter } from "@/gateways/clock/clock.adapter.ts";
import type { Clock } from "@/gateways/clock/clock.typedefs.ts";
import { EnvAdapter } from "@/gateways/env/env.adapter.ts";
import type { Env } from "@/gateways/env/env.typedefs.ts";
import { FileSystemAdapter } from "@/gateways/fileSystem/fileSystem.adapter.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";
import { GitAdapter } from "@/gateways/git/git.adapter.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import { LoggerAdapter } from "@/gateways/logger/logger.adapter.ts";
import type { Logger } from "@/gateways/logger/logger.typedefs.ts";
import { ProcAdapter } from "@/gateways/proc/proc.adapter.ts";
import type { Proc } from "@/gateways/proc/proc.typedefs.ts";
import { SqliteAdapter } from "@/gateways/sqlite/sqlite.adapter.ts";
import type { Sqlite } from "@/gateways/sqlite/sqlite.typedefs.ts";
import { StdioAdapter } from "@/gateways/stdio/stdio.adapter.ts";
import type { Stdio } from "@/gateways/stdio/stdio.typedefs.ts";

/** Builds the real `Gateways`. `envSnapshot` is only consulted for
 * `CCMEM_LOG_LEVEL` to set the logger's threshold — every other port reads the
 * live process directly. */
export class AppGateways implements Gateways {
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
