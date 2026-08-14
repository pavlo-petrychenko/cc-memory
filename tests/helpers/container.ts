import type { AbsPath } from "../../src/core/AbsPath.ts";
import type { Container } from "../../src/platform/container.ts";
import { makeDatabaseAdapter } from "../../src/platform/database.adapter.ts";
import type { SqlDatabase } from "../../src/platform/database.typedefs.ts";
import { makeClockFake } from "./fakes/clockFixed.fake.ts";
import { makeEnvFake } from "./fakes/envMap.fake.ts";
import { makeFsMemoryFake } from "./fakes/fsMemory.fake.ts";
import { makeGitFake } from "./fakes/gitFake.fake.ts";
import { makeIoFake } from "./fakes/ioFake.fake.ts";
import { makeLoggerFake } from "./fakes/loggerCollect.fake.ts";
import { makeProcFake } from "./fakes/procFake.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — the same
// pattern `tests/unit/domain/paths.test.ts` uses for its `HOME` constant.
const DEFAULT_HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `DEFAULT_HOME` above — a fixed test fixture.
const DEFAULT_CWD = "/home/test/project" as AbsPath;

/**
 * Build every fake at once, wired the way `makeRealContainer` wires the real
 * adapters (`git` over `proc`), so a test only overrides what it cares about.
 *
 * `openDatabase` is the one exception to "everything is a fake" — [[conventions]]
 * and CLAUDE.md both forbid a `SqlDatabase` fake (FTS5's stemmer/bm25/`NEAR` ARE the
 * behavior under test), so the default here opens a REAL `bun:sqlite`
 * database. Memoized by path, same as the real container, so repeated calls
 * with the identical path (e.g. `":memory:"`) share one handle instead of
 * silently handing back an empty database each time.
 */
export function makeTestContainer(overrides: Partial<Container> = {}): Container {
  const dbHandles = new Map<string, SqlDatabase>();
  const proc = makeProcFake();

  const defaults: Container = {
    fs: makeFsMemoryFake(),
    git: makeGitFake(),
    proc,
    clock: makeClockFake(),
    env: makeEnvFake(DEFAULT_HOME, DEFAULT_CWD),
    logger: makeLoggerFake(),
    openDatabase: (path: string) => {
      const existing = dbHandles.get(path);
      if (existing !== undefined) return existing;
      const db = makeDatabaseAdapter(path);
      dbHandles.set(path, db);
      return db;
    },
    stdio: makeIoFake(),
  };

  return { ...defaults, ...overrides };
}
