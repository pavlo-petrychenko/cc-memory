import type { Clock } from "@/platform/clock/clock.typedefs.ts";
import type { Env } from "@/platform/env/env.typedefs.ts";
import type { FileSystem } from "@/platform/fileSystem/fileSystem.typedefs.ts";
import type { Git } from "@/platform/git/git.typedefs.ts";
import type { Logger } from "@/platform/logger/logger.typedefs.ts";
import type { Proc } from "@/platform/proc/proc.typedefs.ts";
import type { Sqlite } from "@/platform/sqlite/sqlite.typedefs.ts";
import type { Stdio } from "@/platform/stdio/stdio.typedefs.ts";

/** Every port the codebase needs, bundled. `openDatabase` is a factory, not a
 * field, since the index database path is per-workspace, but it still memoizes to
 * one handle per process per path. */
export type Container = {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly openDatabase: (path: string) => Sqlite;
  readonly stdio: Stdio;
};
