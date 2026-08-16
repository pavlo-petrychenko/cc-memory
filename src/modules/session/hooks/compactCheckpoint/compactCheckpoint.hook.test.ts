import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookResultSerializer } from "@/core/index.ts";
import { HookRuntimeService } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { CompactCheckpointFormatter } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import { CompactCheckpointHook } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.hook.ts";
import { WorklogStoreService } from "@/modules/worklog/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { type IoFake, makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import {
  makeHookWorkspaceResolver,
  makeWorkspaceRepository,
} from "@/testing/fixtures/workspaceContext.fixture.ts";

/**
 * `PostCompact`: persist the compaction summary into today's dated journal —
 * write-only, no stdout.
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
  readonly container: Gateways;
};

async function makeFixture(): Promise<Fixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  await makeWorkspaceRepository(fs).save(REGISTRY_PATH, [PRIMARY]);
  return { io, fs, container };
}

async function runCompactCheckpoint(fixture: Fixture, stdin: string): Promise<void> {
  fixture.io.setStdin(stdin);
  const payloadParser = new PayloadParser();
  const hookRuntimeService = new HookRuntimeService(
    fixture.container,
    payloadParser,
    new HookResultSerializer(),
    makeHookWorkspaceResolver(fixture.container),
  );
  await hookRuntimeService.run(
    "compact-checkpoint",
    (record) => payloadParser.parseCompactCheckpoint(record),
    new CompactCheckpointHook(
      fixture.container,
      new CompactCheckpointFormatter(),
      new WorklogStoreService(fixture.container.fs, fixture.container.git),
    ),
  );
}

describe("PostCompact (compact-checkpoint) hook", () => {
  test("happy path: persists the summary block, no stdout", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(
      fixture,
      JSON.stringify({
        cwd: CWD,
        compact_summary: "Refactored the wrap-gate escalation signature.",
        trigger: "auto",
      }),
    );

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    const written = await fixture.fs.readFile(TODAY_PATH);
    expect(written).toBe(
      "<!-- compaction checkpoint (auto) -->\n" +
        "**Compaction summary:**\n\n" +
        "Refactored the wrap-gate escalation signature.\n",
    );
  });

  test("cwd outside any workspace: no write, exit 0", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(
      fixture,
      JSON.stringify({
        cwd: "/home/test/elsewhere",
        compact_summary: "should not persist",
      }),
    );

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(TODAY_PATH)).toBe(false);
  });

  test("absent compact_summary is silent: no write at all", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(fixture, JSON.stringify({ cwd: CWD }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(TODAY_PATH)).toBe(false);
  });

  test("a whitespace-only compact_summary is also silent", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(
      fixture,
      JSON.stringify({ cwd: CWD, compact_summary: "   \n  " }),
    );

    expect(await fixture.fs.exists(TODAY_PATH)).toBe(false);
  });

  test("missing trigger field falls back to 'auto'", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(
      fixture,
      JSON.stringify({ cwd: CWD, compact_summary: "checkpoint" }),
    );

    const written = await fixture.fs.readFile(TODAY_PATH);
    expect(written).toContain("<!-- compaction checkpoint (auto) -->");
  });

  test("garbage stdin never throws: tolerant-parsed to an empty (silent) payload", async () => {
    const fixture = await makeFixture();

    await runCompactCheckpoint(fixture, "not json");

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(TODAY_PATH)).toBe(false);
  });
});
