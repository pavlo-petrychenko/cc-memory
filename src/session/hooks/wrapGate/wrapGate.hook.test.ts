import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Config } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { WrapGateFormatter } from "@/session/hooks/wrapGate/wrapGate.formatter.ts";
import { WrapGateHook } from "@/session/hooks/wrapGate/wrapGate.hook.ts";
import { PayloadParser } from "@/session/payload/payload.parser.ts";
import { HookResultSerializer } from "@/session/runtime/hookResult.serializer.ts";
import { HookRuntimeService } from "@/session/runtime/runtime.service.ts";
import { type ClockFake, makeClockFake } from "@/testing/fakes/clockFixed.fake.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { type GitFake, makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { type IoFake, makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "@/workspace/index.ts";

/**
 * `Stop`: the dirty-tree signature, the nudge->block escalation, and one
 * `wrap-state.json` per workspace keyed by session id — not one marker file
 * per session, which would otherwise leak a file per session forever.
 */

// SAFETY: fixed test fixtures, matching `tests/helpers/container.ts`'s
// DEFAULT_HOME/DEFAULT_CWD.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
const CONFIG = new ConfigParser().parse({});
// SAFETY: `PRIMARY.indexDb` is `":memory:"`; its `parentDir` is the fixed
// literal `"/"`, so the marker lands at this fixed literal path.
const MARKER_PATH = "/wrap-state.json" as AbsPath;
// SAFETY: a fixed literal path under `PRIMARY.worklogs`/`_root` (the
// worktree slug: `GitFake.showToplevel` defaults to `""`, so `cwd` itself —
// which equals `PRIMARY.match[0]` exactly — is used, relative-to-itself is
// empty).
const STATE_PATH = "/home/test/vault-primary/_Worklogs/_root/STATE.md" as AbsPath;

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
  readonly clock: ClockFake;
  readonly container: Container;
};

async function makeFixture(): Promise<Fixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const git = makeGitFake();
  const clock = makeClockFake();
  const container = makeTestContainer({ stdio: io, fs, git, clock });
  await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
  return { io, fs, git, clock, container };
}

/** `dirtyCount` untracked-file lines of `git status --porcelain` output. */
function statusPorcelainWithLines(count: number): string {
  return Array.from(
    { length: count },
    (_unused, index) => `?? scratch-${index}.txt`,
  ).join("\n");
}

async function runWrapGate(
  fixture: Fixture,
  stdin: string,
  config: Config = CONFIG,
): Promise<void> {
  fixture.io.setStdin(stdin);
  const payloadParser = new PayloadParser();
  const hookRuntimeService = new HookRuntimeService(
    fixture.container,
    payloadParser,
    new HookResultSerializer(),
  );
  await hookRuntimeService.run(
    "wrap-gate",
    (record) => payloadParser.parseWrapGate(record),
    new WrapGateHook(fixture.container, config, payloadParser, new WrapGateFormatter()),
  );
}

/** The raw stdin fields this hook reads (`cwd`, `session_id`,
 * `stop_hook_active`), all optional so a test can override just one. */
type StopPayloadOverrides = {
  readonly cwd?: string;
  readonly session_id?: string;
  readonly stop_hook_active?: boolean;
};

function payload(overrides: StopPayloadOverrides = {}): string {
  return JSON.stringify({ cwd: CWD, session_id: "s1", ...overrides });
}

/** One `wrap-state.json` entry (`sig`/`ts`/`nudges`), keyed by session id —
 * the shared marker file's shape, read back for assertions. */
type WrapStateFileContents = Readonly<
  Record<string, { readonly sig: string; readonly ts: number; readonly nudges: number }>
>;

describe("Stop (wrap-gate) hook", () => {
  test("happy path: first nudge on a dirty tree", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));
    fixture.git.setRevParse("abcdef0123456789\n");

    await runWrapGate(fixture, payload());

    expect(fixture.io.written).toHaveLength(1);
    const rendered: {
      readonly hookSpecificOutput: {
        readonly hookEventName: string;
        readonly additionalContext: string;
      };
    } = JSON.parse(fixture.io.written[0] ?? "");
    expect(rendered.hookSpecificOutput.hookEventName).toBe("Stop");
    expect(rendered.hookSpecificOutput.additionalContext).toBe(
      "📝 Unsaved work in `_root` (2 uncommitted files). Consider running the " +
        "`remember` skill to update this worktree's worklog (summary of " +
        "changes + open threads) before finishing.",
    );
    expect(fixture.io.exitCode).toBe(0);

    // One shared `wrap-state.json`, not a `.wrap-s1` file.
    const stateFileContents: WrapStateFileContents = JSON.parse(
      await fixture.fs.readFile(MARKER_PATH),
    );
    expect(stateFileContents["s1"]).toEqual({ sig: "abcdef012345:2", ts: 0, nudges: 1 });
  });

  test("cwd outside any workspace: silent, exit 0", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));

    await runWrapGate(fixture, payload({ cwd: "/home/test/elsewhere" }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
  });

  test("missing session_id falls back to 'nosession'", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(1));

    await runWrapGate(fixture, JSON.stringify({ cwd: CWD }));

    expect(fixture.io.written).toHaveLength(1);
    const stateFileContents: WrapStateFileContents = JSON.parse(
      await fixture.fs.readFile(MARKER_PATH),
    );
    expect(Object.keys(stateFileContents)).toEqual(["nosession"]);
  });

  test("stop_hook_active is always silent, no marker written", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));

    await runWrapGate(fixture, payload({ stop_hook_active: true }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(MARKER_PATH)).toBe(false);
  });

  test("a clean tree is silent and clears this session's stored state", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));
    await runWrapGate(fixture, payload()); // seed a stored entry for "s1" first
    expect(await fixture.fs.exists(MARKER_PATH)).toBe(true);

    fixture.git.setStatusPorcelain(""); // now clean
    await runWrapGate(fixture, payload());

    // `io.written` accumulates across both calls on this fixture — the clean
    // invocation itself adds nothing (still just the one nudge from above).
    expect(fixture.io.written).toHaveLength(1);
    expect(fixture.io.exitCode).toBe(0);
    const stateFileContents: WrapStateFileContents = JSON.parse(
      await fixture.fs.readFile(MARKER_PATH),
    );
    expect(stateFileContents["s1"]).toBeUndefined();
  });

  test("already captured: same signature and a refreshed STATE.md stays silent", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));
    fixture.clock.setNowMs(1000);
    await runWrapGate(fixture, payload());
    expect(fixture.io.written).toHaveLength(1);

    // STATE.md refreshed (mtime 2000ms) AFTER the marker's ts (1000ms).
    fixture.fs.seedFile(STATE_PATH, "# _root\n", 2000);
    fixture.clock.setNowMs(3000);
    await runWrapGate(fixture, payload());

    expect(fixture.io.written).toHaveLength(1); // still just the first write
  });

  test("escalates to block after repeated nudges with sustained drift", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(5)); // >= BLOCK_DRIFT (5)

    await runWrapGate(fixture, payload());
    const firstResult: {
      readonly hookSpecificOutput?: unknown;
      readonly decision?: string;
    } = JSON.parse(fixture.io.written[0] ?? "");
    expect(firstResult.decision).toBeUndefined(); // nudge, not a block (nudges=1 < BLOCK_AFTER)

    await runWrapGate(fixture, payload());
    expect(fixture.io.written).toHaveLength(2);
    const secondResult: { readonly decision: string; readonly reason: string } =
      JSON.parse(fixture.io.written[1] ?? "");
    expect(secondResult.decision).toBe("block");
    expect(secondResult.reason).toBe(
      "Before you finish: capture this session in working memory for `_root` " +
        "(5 uncommitted files). Run the `remember` skill — write today's " +
        "worklog entry with a **summary of ALL changes you made**, plus " +
        "Learned/Decided/Open (tag durable findings #promote), and refresh " +
        "STATE.md. Worklogs need no approval.",
    );
  });

  test("CCMEM_GATE_DISABLE=1 nudges forever instead of escalating", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(5));
    const gateDisabledConfig = new ConfigParser().parse({ CCMEM_GATE_DISABLE: "1" });

    await runWrapGate(fixture, payload(), gateDisabledConfig);
    await runWrapGate(fixture, payload(), gateDisabledConfig);

    const secondResult: { readonly decision?: string } = JSON.parse(
      fixture.io.written[1] ?? "",
    );
    expect(secondResult.decision).toBeUndefined();
  });

  test("garbage stdin never throws: tolerant-parsed to an empty payload, exit 0", async () => {
    const fixture = await makeFixture();
    fixture.git.setStatusPorcelain(statusPorcelainWithLines(2));

    await runWrapGate(fixture, "not json");

    // Falls back to the process cwd (`/home/test/project`, `PRIMARY`'s match).
    expect(fixture.io.written).toHaveLength(1);
    expect(fixture.io.exitCode).toBe(0);
  });
});
