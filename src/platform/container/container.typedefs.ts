import type { Clock } from "@/platform/clock/index.ts";
import type { SqlDatabase } from "@/platform/db/index.ts";
import type { Env } from "@/platform/env/index.ts";
import type { FileSystem } from "@/platform/fileSystem/index.ts";
import type { Git } from "@/platform/git/index.ts";
import type { Logger } from "@/platform/logger/index.ts";
import type { Proc } from "@/platform/proc/index.ts";
import type { Stdio } from "@/platform/stdio/index.ts";

/**
 * Every port the codebase needs, bundled. The real one (`AppContainer`) is
 * built only where a command has to act on this actual machine: the CLI
 * entrypoint, the hook dispatcher, and install/uninstall. Everything else
 * receives a `Container` as a parameter, so a test can pass
 * `testContainer.fixture.ts`'s `makeTestContainer` instead.
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
