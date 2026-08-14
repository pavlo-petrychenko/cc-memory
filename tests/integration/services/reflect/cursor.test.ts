import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../../src/domain/paths.ts";
import type { Workspace } from "../../../../src/domain/Workspace.ts";
import {
  isBriefFullyProcessed,
  isDue,
  isPreviousBriefProcessed,
  migrateLegacyCursor,
  readLastConsolidatedMs,
  stampLastConsolidated,
  stampLastRun,
} from "../../../../src/services/reflect/cursor.ts";
import { gatherCandidates } from "../../../../src/services/reflect/gather.ts";
import { runReflect } from "../../../../src/services/reflect/run.ts";
import { makeTestContainer } from "../../../helpers/container.ts";
import { makeClockFake } from "../../../helpers/fakes/clockFixed.fake.ts";
import { makeFsMemoryFake } from "../../../helpers/fakes/fsMemory.fake.ts";
import { makeProcFake } from "../../../helpers/fakes/procFake.fake.ts";

/**
 * `bin/reflector.py:30-49`'s `is_due`/`stamp`, reworked into two cursors
 * (bugfix #3). The final `describe` block is THE regression test: it proves
 * an unattended tmux spawn no longer drops candidates the way the old single
 * `.last-reflect` stamp did.
 */

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier — an opaque key
// into Container.openDb's per-path memoization, not a real filesystem path.
const IN_MEMORY_DB = ":memory:" as AbsPath;
// SAFETY: `parentDirectory(":memory:")` (cursor.ts) falls back to the
// filesystem root `/` (no `/` at all in `:memory:`) — a synthetic but
// perfectly valid `fsMemoryFake` map key, never produced by a real `indexDb`.
const LEGACY_CURSOR_PATH = "//.last-reflect" as AbsPath;
// SAFETY: see `LEGACY_CURSOR_PATH` immediately above — identical reasoning.
const LAST_RUN_CURSOR_PATH = "//.reflect-last-run" as AbsPath;
// SAFETY: see `LEGACY_CURSOR_PATH` above — identical reasoning.
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

const HOUR_MS = 3_600_000;

describe("reflect/cursor isDue (bin/reflector.py:34-43)", () => {
  test("due when there is no lastRun cursor yet", async () => {
    const fs = makeFsMemoryFake();
    expect(await isDue(fs, makeWorkspace(), 1_000_000, 20)).toBe(true);
  });

  test("not due when the elapsed time is under the threshold", async () => {
    const fs = makeFsMemoryFake();
    await stampLastRun(fs, makeWorkspace(), 0);
    expect(await isDue(fs, makeWorkspace(), 10 * HOUR_MS, 20)).toBe(false);
  });

  test("due once the elapsed time reaches the threshold exactly", async () => {
    const fs = makeFsMemoryFake();
    await stampLastRun(fs, makeWorkspace(), 0);
    expect(await isDue(fs, makeWorkspace(), 20 * HOUR_MS, 20)).toBe(true);
  });

  test("due once the elapsed time exceeds the threshold", async () => {
    const fs = makeFsMemoryFake();
    await stampLastRun(fs, makeWorkspace(), 0);
    expect(await isDue(fs, makeWorkspace(), 21 * HOUR_MS, 20)).toBe(true);
  });

  test("a cursor that exists but can't be read counts as absent -> due", async () => {
    const fs = makeFsMemoryFake();
    // A directory sitting where the cursor FILE should be: `exists()` is
    // true, but `readFile()` throws — the same "unreadable" shape
    // `is_due`'s `try/except: return True` (`bin/reflector.py:38-41`) covers.
    fs.seedDir(LAST_RUN_CURSOR_PATH);
    expect(await isDue(fs, makeWorkspace(), 1_000_000, 20)).toBe(true);
  });
});

describe("reflect/cursor migrateLegacyCursor", () => {
  test("a fresh workspace with no legacy file is a no-op", async () => {
    const fs = makeFsMemoryFake();
    await migrateLegacyCursor(fs, makeWorkspace());
    expect(await fs.exists(LAST_RUN_CURSOR_PATH)).toBe(false);
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
  });

  test("seeds BOTH new cursors from an existing Python .last-reflect (seconds -> ms)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(LEGACY_CURSOR_PATH, "1000.5", 0); // time.time() seconds

    await migrateLegacyCursor(fs, makeWorkspace());

    expect(await fs.readFile(LAST_RUN_CURSOR_PATH)).toBe("1000500");
    expect(await fs.readFile(LAST_CONSOLIDATED_CURSOR_PATH)).toBe("1000500");
  });

  test("does nothing once either new cursor already exists", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(LEGACY_CURSOR_PATH, "1000.5", 0);
    await stampLastRun(fs, makeWorkspace(), 42);

    await migrateLegacyCursor(fs, makeWorkspace());

    expect(await fs.readFile(LAST_RUN_CURSOR_PATH)).toBe("42");
    expect(await fs.exists(LAST_CONSOLIDATED_CURSOR_PATH)).toBe(false);
  });
});

describe("reflect/cursor stamp/read round-trip", () => {
  test("readLastConsolidatedMs is null until stamped", async () => {
    const fs = makeFsMemoryFake();
    expect(await readLastConsolidatedMs(fs, makeWorkspace())).toBeNull();
    await stampLastConsolidated(fs, makeWorkspace(), 12_345);
    expect(await readLastConsolidatedMs(fs, makeWorkspace())).toBe(12_345);
  });
});

describe("reflect/cursor isBriefFullyProcessed", () => {
  const HEADER =
    "# Consolidation brief — primary — 2026-08-14\n\nintro text\n\n## Candidates\n";
  const FOOTER = "\n## Existing related KB notes\n(none)\n";

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly body: string;
    readonly expected: boolean;
  }> = [
    {
      name: "untouched brief (no checkboxes at all)",
      body: "- (wt1/a.md) fact one\n",
      expected: false,
    },
    {
      name: "every candidate marked [x]",
      body: "- [x] (wt1/a.md) fact one\n- [x] (wt1/b.md) fact two\n",
      expected: true,
    },
    {
      name: "a mix of [x] and [~] counts as fully processed",
      body: "- [x] (wt1/a.md) fact one\n- [~] (wt1/b.md) fact two\n",
      expected: true,
    },
    {
      name: "only SOME candidates marked is not fully processed",
      body: "- [x] (wt1/a.md) fact one\n- (wt1/b.md) fact two\n",
      expected: false,
    },
  ];

  for (const { name, body, expected } of cases) {
    test(name, () => {
      expect(isBriefFullyProcessed(`${HEADER}${body}${FOOTER}`)).toBe(expected);
    });
  }

  test("a brief with no ## Candidates heading at all is unprocessed", () => {
    expect(
      isBriefFullyProcessed("# Consolidation brief\n\nsomething else entirely\n"),
    ).toBe(false);
  });
});

describe("reflect/cursor isPreviousBriefProcessed", () => {
  test("false when the _proposals directory doesn't exist yet", async () => {
    const fs = makeFsMemoryFake();
    expect(await isPreviousBriefProcessed(fs, makeWorkspace())).toBe(false);
  });

  test("reads the MOST RECENT brief by filename date", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs("_proposals/_brief-2026-08-01.md"),
      "## Candidates\n- [x] (wt1/a.md) old, already handled\n",
      0,
    );
    fs.seedFile(
      underWorklogs("_proposals/_brief-2026-08-14.md"),
      "## Candidates\n- (wt1/b.md) newest, still pending\n",
      0,
    );

    expect(await isPreviousBriefProcessed(fs, makeWorkspace())).toBe(false);
  });

  test("a brief path that can't be read (e.g. a stray directory) counts as unprocessed", async () => {
    const fs = makeFsMemoryFake();
    // `seedDir` (unlike `seedFile`) does not create ancestor directories, so
    // the `_proposals` directory itself must exist too, or `readDir` throws
    // one step earlier than intended (a DIFFERENT already-covered branch).
    fs.seedDir(underWorklogs("_proposals"));
    fs.seedDir(underWorklogs("_proposals/_brief-2026-08-14.md"));

    expect(await isPreviousBriefProcessed(fs, makeWorkspace())).toBe(false);
  });
});

describe("reflect/cursor — the unattended-session regression (bugfix #3)", () => {
  test("run twice: the same candidates are offered again after an unattended tmux spawn", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs("wt1/2026-08-01.md"),
      "#promote a fact nobody has reviewed\n",
      100,
    );
    const workspace = makeWorkspace();

    // Run 1: tmux is available, no existing session, spawn succeeds — an
    // "unattended" night (nobody ever attends the session).
    const firstProc = makeProcFake();
    firstProc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    });
    firstProc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "", exitCode: 1 },
    }); // no session yet
    firstProc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "", exitCode: 0 },
    }); // new-session ok
    const firstContainer = makeTestContainer({
      fs,
      clock: makeClockFake(1_000),
      proc: firstProc,
    });
    const firstRunLines = await runReflect(firstContainer, workspace, {
      ifDue: false,
      thresholdHours: 20,
      headless: false,
      force: false,
    });
    expect(firstRunLines[0]).toContain("interactive consolidation");

    // The OLD single-cursor bug: `since` would already have jumped past this
    // candidate here. Prove it did NOT — `gatherCandidates` with the current
    // `since` cursor still finds it.
    const sinceAfterFirstRun = (await readLastConsolidatedMs(fs, workspace)) ?? 0;
    const stillOffered = await gatherCandidates(fs, workspace, sinceAfterFirstRun);
    expect(stillOffered).toEqual([
      { text: "a fact nobody has reviewed", src: "wt1/2026-08-01.md" },
    ]);

    // Run 2 (headless, to sidestep re-scripting tmux): the SAME candidate is
    // gathered and re-proposed — nothing was silently dropped.
    const secondProc = makeProcFake();
    secondProc.enqueue({
      kind: "resolve",
      result: { stdout: "[]", stderr: "", exitCode: 0 },
    });
    const secondContainer = makeTestContainer({
      fs,
      clock: makeClockFake(2_000),
      proc: secondProc,
    });
    const secondRunLines = await runReflect(secondContainer, workspace, {
      ifDue: false,
      thresholdHours: 20,
      headless: true,
      force: false,
    });
    expect(secondRunLines[0]).toContain("1 candidates ->");
  });

  test("marking the brief fully processed advances the cursor past it", async () => {
    const fs = makeFsMemoryFake();
    const workspace = makeWorkspace();
    fs.seedFile(
      underWorklogs("wt1/2026-08-01.md"),
      "#promote a fact nobody has reviewed\n",
      100,
    );

    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4", stderr: "", exitCode: 0 },
    });
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } });
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    const container = makeTestContainer({ fs, clock: makeClockFake(1_000), proc });
    await runReflect(container, workspace, {
      ifDue: false,
      thresholdHours: 20,
      headless: false,
      force: false,
    });
    expect(await readLastConsolidatedMs(fs, workspace)).toBeNull(); // still not lost, but not settled either

    // A human works through the brief by hand and checks everything off.
    const briefPath = underWorklogs("_proposals/_brief-2026-01-01.md");
    const briefContent = await fs.readFile(briefPath);
    await fs.writeFile(
      briefPath,
      briefContent.replace(
        "- (wt1/2026-08-01.md) a fact nobody has reviewed",
        "- [x] (wt1/2026-08-01.md) a fact nobody has reviewed",
      ),
    );

    // The NEXT run notices the brief is fully processed and settles the
    // cursor before gathering — no re-offering the same handled candidate.
    const nextProc = makeProcFake();
    const nextClock = makeClockFake(500_000);
    const nextContainer = makeTestContainer({ fs, clock: nextClock, proc: nextProc });
    const nextLines = await runReflect(nextContainer, workspace, {
      ifDue: false,
      thresholdHours: 20,
      headless: true,
      force: false,
    });
    expect(nextLines).toEqual(["primary: no candidates since last run"]);
    expect(await readLastConsolidatedMs(fs, workspace)).toBe(500_000);
  });
});
