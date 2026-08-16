import { absPath } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { SqliteAdapter } from "@/gateways/index.ts";
import type { Sqlite } from "@/gateways/index.ts";
import { makeClockFake } from "@/testing/fakes/clockFixed.fake.ts";
import { makeEnvFake } from "@/testing/fakes/envMap.fake.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeLoggerFake } from "@/testing/fakes/loggerCollect.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";

const DEFAULT_HOME = absPath("/home/test");
const DEFAULT_CWD = absPath("/home/test/project");
const DEFAULT_REPO_ROOT = absPath("/home/test/repo");

/** Builds every fake at once, wired the way `AppGateways` wires the real adapters,
 * so a test only overrides what it cares about. `openDatabase` is the one exception
 * to "everything is a fake" — CLAUDE.md forbids a `Sqlite` fake, so this opens a
 * REAL `bun:sqlite` database, memoized by path like the real container. */
export function makeTestGateways(overrides: Partial<Gateways> = {}): Gateways {
  const dbHandles = new Map<string, Sqlite>();
  const proc = makeProcFake();

  const defaults: Gateways = {
    fs: makeFsMemoryFake(),
    git: makeGitFake(),
    proc,
    clock: makeClockFake(),
    env: makeEnvFake(DEFAULT_HOME, DEFAULT_CWD, DEFAULT_REPO_ROOT),
    logger: makeLoggerFake(),
    openDatabase: (path: string) => {
      const existing = dbHandles.get(path);
      if (existing !== undefined) return existing;
      const db = new SqliteAdapter(path);
      dbHandles.set(path, db);
      return db;
    },
    stdio: makeIoFake(),
  };

  return { ...defaults, ...overrides };
}
