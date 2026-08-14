import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { Workspace } from "../../../src/core/Workspace.ts";
import { runReflect, type ReflectRunOptions } from "../../../src/reflect/run.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeClockFake } from "../../helpers/fakes/clockFixed.fake.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeProcFake, type ProcFake } from "../../helpers/fakes/procFake.fake.ts";

/**
 * `runReflect` orchestration (`main`, `bin/reflector.py:250-318`) end to end,
 * against `procFake`/`clockFixed` — NEVER a real tmux session or `claude`.
 * The cursor-advance assertions below are what proves bugfix #3: a
 * successful tmux spawn stamps ONLY `lastRun`, never `lastConsolidated`.
 */

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier — an opaque key
// into Container.openDb's per-path memoization, not a real filesystem path.
const IN_MEMORY_DB = ":memory:" as AbsPath;

// SAFETY: `parentDirectory(":memory:")` (cursor.ts) falls back to the
// filesystem root `/`, since `:memory:` has no `/` in it at all — giving
// this synthetic (but perfectly valid `fsMemoryFake` map key) double-slash
// path. A REAL `indexDb` (always a real, single-slash directory) never
// produces this; it's purely an artifact of using `:memory:` in tests.
const LAST_RUN_CURSOR_PATH = "//.reflect-last-run" as AbsPath;
// SAFETY: see `LAST_RUN_CURSOR_PATH` immediately above — identical reasoning.
const LAST_CONSOLIDATED_CURSOR_PATH = "//.reflect-last-consolidated" as AbsPath;

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const kb = expandPath("/home/test/kb", HOME);
  const worklogs = expandPath("/home/test/kb/_Worklogs", HOME);
  const projectDir = expandPath("/home/test/project", HOME);
  return {
    id: "primary",
    match: [projectDir],
    kb,
    worklogs,
    exclude: [],
    indexDb: IN_MEMORY_DB,
    matchedPrefix: projectDir,
    ...overrides,
  };
}

function underWorklogs(relativePath: string): AbsPath {
  return expandPath(`/home/test/kb/_Worklogs/${relativePath}`, HOME);
}

function defaultOptions(overrides: Partial<ReflectRunOptions> = {}): ReflectRunOptions {
  return {
    ifDue: false,
    thresholdHours: 20,
    headless: false,
    force: false,
    ...overrides,
  };
}

function seedOneCandidate(fs: ReturnType<typeof makeFsMemoryFake>): void {
  fs.seedFile(
    underWorklogs("wt1/2026-08-01.md"),
    "#promote a durable fact worth keeping\n",
    100,
  );
}

/** `has-session` "not found" — the shape a stale/no-such session takes. */
function noSuchSessionResponse() {
  return { kind: "resolve" as const, result: { stdout: "", stderr: "", exitCode: 1 } };
}

describe("reflect/run runReflect — due check", () => {
  test("`--if-due` skips a run that isn't due yet, touching nothing else", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const clock = makeClockFake(1_000_000);
    const proc = makeProcFake();
    const container = makeTestContainer({ fs, clock, proc });
    // Seed `lastRun` as if a run just happened a moment ago.
    fs.seedFile(LAST_RUN_CURSOR_PATH, "999_999", 0);

    const lines = await runReflect(
      container,
      makeWorkspace(),
      defaultOptions({ ifDue: true, thresholdHours: 20 }),
    );

    expect(lines).toEqual(["primary: not due, skipping"]);
    expect(proc.calls).toEqual([]); // no tmux/claude probing at all
  });
});

describe("reflect/run runReflect — no candidates", () => {
  test("stamps ONLY lastRun; lastConsolidated is never created", async () => {
    const fs = makeFsMemoryFake();
    const clock = makeClockFake(5_000);
    const container = makeTestContainer({ fs, clock, proc: makeProcFake() });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines).toEqual(["primary: no candidates since last run"]);
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
  });
});

describe("reflect/run runReflect — headless", () => {
  test("writes a proposals file and stamps BOTH cursors", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const clock = makeClockFake(10_000, "2026-08-14");
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout:
          '[{"action":"ADD","title":"Widget","folder":"CC-memory","importance":6,' +
          '"rationale":"durable and reusable","body":"the fact","source":"wt1/2026-08-01.md"}]',
        stderr: "",
        exitCode: 0,
      },
    });
    const container = makeTestContainer({ fs, clock, proc });

    const lines = await runReflect(
      container,
      makeWorkspace(),
      defaultOptions({ headless: true }),
    );

    expect(lines).toEqual([
      "primary: 1 candidates -> 1 proposal(s) -> " +
        `${underWorklogs("_proposals/2026-08-14.md")}`,
    ]);
    const proposalsContent = await fs.readFile(underWorklogs("_proposals/2026-08-14.md"));
    expect(proposalsContent).toContain("## [ ] ADD: Widget");
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(true);
  });

  test("--headless never probes tmux at all", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "[]", stderr: "", exitCode: 0 } });
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    await runReflect(container, makeWorkspace(), defaultOptions({ headless: true }));

    // Every recorded call must be the ONE `claude -p`, never `tmux`.
    for (const call of proc.calls) expect(call.command).toBe("claude");
  });

  test("a raw-candidate fallback (LLM unavailable) still advances both cursors", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("spawn claude ENOENT") });
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(
      container,
      makeWorkspace(),
      defaultOptions({ headless: true }),
    );

    expect(lines[0]).toContain("(raw, LLM unavailable) ->");
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(true);
  });
});

describe("reflect/run runReflect — interactive tmux (bugfix #3)", () => {
  function scriptFreshSpawn(proc: ProcFake): void {
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    }); // tmux -V
    proc.enqueue(noSuchSessionResponse()); // has-session: none yet
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // new-session
  }

  test("a successful spawn stamps ONLY lastRun — the actual bugfix", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    scriptFreshSpawn(proc);
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      "interactive consolidation in tmux 'cc-consolidate-primary'",
    );
    expect(lines[0]).toContain("brief: ");
    // THE regression this bugfix closes: lastConsolidated must NOT advance
    // just because a tmux session was spawned — only lastRun does.
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
  });

  test("an active existing session is left alone; NEITHER cursor advances", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    }); // tmux -V
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // has-session: yes
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "claude\n", stderr: "", exitCode: 0 },
    }); // pane: claude, active
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines).toEqual([
      "primary: consolidation already running -> tmux attach -t cc-consolidate-primary" +
        "  (or rerun with --force)",
    ]);
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(false);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
    expect(proc.calls).toHaveLength(3); // no kill-session, no new-session
  });

  test("--force replaces an active session instead of leaving it alone", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    }); // tmux -V
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // has-session: yes
    // no isSessionActive probe: `!options.force && ...` short-circuits it.
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // kill-session
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // new-session
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(
      container,
      makeWorkspace(),
      defaultOptions({ force: true }),
    );

    expect(lines[0]).toBe("primary: replaced existing consolidation session");
    expect(lines[1]).toContain(
      "interactive consolidation in tmux 'cc-consolidate-primary'",
    );
    expect(proc.calls).toHaveLength(4);
    expect(proc.calls[1]?.args).toEqual(["has-session", "-t", "cc-consolidate-primary"]);
    expect(proc.calls[2]?.args).toEqual(["kill-session", "-t", "cc-consolidate-primary"]);
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
  });

  test("a stale (bare-shell) leftover session is replaced without --force", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    }); // tmux -V
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // has-session: yes
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "-zsh\n", stderr: "", exitCode: 0 },
    }); // pane: bare shell
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // kill-session
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // new-session
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines[0]).toBe("primary: replaced stale consolidation session");
  });

  test("tmux missing entirely falls straight to headless, no tmux calls", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("spawn tmux ENOENT") }); // tmux -V fails
    proc.enqueue({ kind: "resolve", result: { stdout: "[]", stderr: "", exitCode: 0 } }); // claude -p
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("proposal(s)");
    expect(proc.calls[0]?.command).toBe("tmux");
    expect(proc.calls[1]?.command).toBe("claude");
  });

  test("a failed spawn falls through to headless, both lines are emitted", async () => {
    const fs = makeFsMemoryFake();
    seedOneCandidate(fs);
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    }); // tmux -V
    proc.enqueue(noSuchSessionResponse()); // has-session: none
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "duplicate session", exitCode: 1 },
    }); // new-session fails
    proc.enqueue({ kind: "resolve", result: { stdout: "[]", stderr: "", exitCode: 0 } }); // claude -p
    const container = makeTestContainer({ fs, clock: makeClockFake(1), proc });

    const lines = await runReflect(container, makeWorkspace(), defaultOptions());

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "primary: tmux spawn failed (duplicate session); falling back to headless",
    );
    expect(lines[1]).toContain("proposal(s)");
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(true);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(true);
  });
});
