import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { parseConfig } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { handleWorklogFloor } from "@/session/hooks/worklogFloor/worklogFloor.hook.ts";
import { parseWorklogFloorPayload } from "@/session/payload/payload.parser.ts";
import { runHook } from "@/session/runtime/runtime.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { type GitFake, makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { type IoFake, makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "@/workspace/index.ts";

/**
 * `SessionEnd`: a deterministic, write-only git/command skeleton appended to
 * today's dated journal — never any stdout.
 */

// SAFETY: fixed test fixtures, matching `tests/helpers/container.ts`'s
// DEFAULT_HOME/DEFAULT_CWD.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
const CONFIG = parseConfig({});
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
  readonly container: Container;
};

async function makeFixture(): Promise<Fixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const git = makeGitFake();
  const container = makeTestContainer({ stdio: io, fs, git });
  await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
  return { io, fs, git, container };
}

async function runWorklogFloor(fixture: Fixture, stdin: string): Promise<void> {
  fixture.io.setStdin(stdin);
  await runHook(
    fixture.container,
    CONFIG,
    "worklog-floor",
    parseWorklogFloorPayload,
    handleWorklogFloor,
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
