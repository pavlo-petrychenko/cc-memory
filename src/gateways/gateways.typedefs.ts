import type { Clock } from "@/gateways/clock/clock.typedefs.ts";
import type { Env } from "@/gateways/env/env.typedefs.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import type { Logger } from "@/gateways/logger/logger.typedefs.ts";
import type { Proc } from "@/gateways/proc/proc.typedefs.ts";
import type { Sqlite } from "@/gateways/sqlite/sqlite.typedefs.ts";
import type { Stdio } from "@/gateways/stdio/stdio.typedefs.ts";

/** Every port the codebase needs, bundled. `openDatabase` is a factory, not a
 * field, since the index database path is per-workspace, but it still memoizes to
 * one handle per process per path. */
export type Gateways = {
  readonly fs: FileSystem;
  readonly git: Git;
  readonly proc: Proc;
  readonly clock: Clock;
  readonly env: Env;
  readonly logger: Logger;
  readonly openDatabase: (path: string) => Sqlite;
  readonly stdio: Stdio;
};
