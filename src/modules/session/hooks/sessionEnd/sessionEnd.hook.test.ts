import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookResultSerializer } from "@/core/index.ts";
import { HookRuntimeService } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { SessionEndHook } from "@/modules/session/hooks/sessionEnd/sessionEnd.hook.ts";
import { WorklogFloorFormatter, WorklogStoreService } from "@/modules/worklog/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { type GitFake, makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { type IoFake, makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import {
  makeHookWorkspaceResolver,
  makeWorkspaceRepository,
} from "@/testing/fixtures/workspaceContext.fixture.ts";

/**
 * `SessionEnd`: a deterministic, write-only git/command skeleton appended to
 * today's dated journal — never any stdout.
 */

// SAFETY: fixed test fixtures, matching `testGateways.fixture.ts`'s
// DEFAULT_HOME/DEFAULT_CWD.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
// SAFETY: a fixed literal path — `Clock` fake's `today()` defaults to
// "2026-01-01" (`clockFixed.fake.ts`), and the worktree slug is `_root`
// (same reasoning as `sessionStart.hook.test.ts`'s `STATE_PATH`).
const TODAY_PATH = "/home/test/vault-primary/_Worklogs/_root/2026-01-01.md" as AbsPath;

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: ["_Worklogs"],
  indexDb: ":memory:",
};

type Fixture = {
  readonly io: IoFake;
  readonly fs: ReturnType<typeof makeFsMemoryFake>;
  readonly git: GitFake;
  readonly container: Gateways;
};

async function makeFixture(): Promise<Fixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const git = makeGitFake();
  const container = makeTestGateways({ stdio: io, fs, git });
  await makeWorkspaceRepository(fs).save(REGISTRY_PATH, [PRIMARY]);
  return { io, fs, git, container };
}

async function runWorklogFloor(fixture: Fixture, stdin: string): Promise<void> {
  fixture.io.setStdin(stdin);
  const payloadParser = new PayloadParser();
  const hookRuntimeService = new HookRuntimeService(
    fixture.container,
    payloadParser,
    new HookResultSerializer(),
    makeHookWorkspaceResolver(fixture.container),
  );
  await hookRuntimeService.run(
    "worklog-floor",
    (record) => payloadParser.parseWorklogFloor(record),
    new SessionEndHook(
      fixture.container,
      new WorklogFloorFormatter(),
      new WorklogStoreService(fixture.container.fs, fixture.container.git),
    ),
  );
}

describe("SessionEnd (worklog-floor) hook", () => {
  test("happy path: writes the deterministic skeleton, no stdout", async () => {
    const fixture = await makeFixture();
    fixture.git.setRevParse("main\n");
    fixture.git.setDiffStat(" 1 file changed, 2 insertions(+)\n");
    fixture.git.setLogOneline("abc1234 initial commit\n");

    await runWorklogFloor(fixture, JSON.stringify({ cwd: CWD, reason: "exit" }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    const written = await fixture.fs.readFile(TODAY_PATH);
    expect(written).toBe(
      "<!-- auto (SessionEnd 2026-01-01, reason=exit) -->\n" +
        "<!-- branch: main -->\n" +
        "<!-- uncommitted: 1 file changed, 2 insertions(+) -->\n" +
        "<!-- recent commits:\n" +
        "  abc1234 initial commit\n" +
        "-->\n",
    );
  });

  test("cwd outside any workspace: no write, exit 0", async () => {
    const fixture = await makeFixture();

    await runWorklogFloor(fixture, JSON.stringify({ cwd: "/home/test/elsewhere" }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(TODAY_PATH)).toBe(false);
  });

  test("missing reason field defaults to 'n/a'", async () => {
    const fixture = await makeFixture();

    await runWorklogFloor(fixture, JSON.stringify({ cwd: CWD }));

    const written = await fixture.fs.readFile(TODAY_PATH);
    expect(written).toContain("reason=n/a");
  });

  test("no git activity at all: the fallback comment", async () => {
    const fixture = await makeFixture();
    // Every `Git` call defaults to `""` in `gitFake.fake.ts`.

    await runWorklogFloor(fixture, JSON.stringify({ cwd: CWD, reason: "exit" }));

    const written = await fixture.fs.readFile(TODAY_PATH);
    expect(written).toBe(
      "<!-- auto (SessionEnd 2026-01-01, reason=exit) -->\n" +
        "<!-- no git activity detected -->\n",
    );
  });

  test("garbage stdin never throws: tolerant-parsed to an empty payload", async () => {
    const fixture = await makeFixture();

    await runWorklogFloor(fixture, "not json");

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    // Falls back to the process cwd (`PRIMARY`'s match) — still writes.
    expect(await fixture.fs.exists(TODAY_PATH)).toBe(true);
  });
});
