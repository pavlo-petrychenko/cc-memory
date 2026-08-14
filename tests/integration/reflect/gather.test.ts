import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { Workspace } from "../../../src/core/Workspace.ts";
import { gatherCandidates } from "../../../src/reflect/gather.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier — an opaque key into
// Container.openDb's per-path memoization, not a real filesystem path.
const IN_MEMORY_DB = ":memory:" as AbsPath;

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const kb = expandPath("/home/test/kb", HOME);
  const worklogs = expandPath("/home/test/kb/_Worklogs", HOME);
  return {
    id: "test",
    match: [kb],
    kb,
    worklogs,
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: IN_MEMORY_DB,
    matchedPrefix: kb,
    ...overrides,
  };
}

function underWorklogs(relativePath: string): AbsPath {
  return expandPath(`/home/test/kb/_Worklogs/${relativePath}`, HOME);
}

describe("reflect/gather gatherCandidates", () => {
  test("a #promote line without a leading **Field:** prefix", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/2026-08-01.md"), "#promote this fact\n", 100);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    // The tag itself is removed and the result trimmed of " -*" at both
    // ends (`stripChars`) — text BEFORE the tag on the same line is
    // preserved verbatim, so the tag is placed at the start here to keep
    // this test's expectation simple and exact.
    expect(candidates).toEqual([{ text: "this fact", src: "wt1/2026-08-01.md" }]);
  });

  test("a #promote line WITH a leading **Field:** prefix has it stripped", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs("wt1/2026-08-01.md"),
      "**Learned:** something #promote\n",
      100,
    );

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([{ text: "something", src: "wt1/2026-08-01.md" }]);
  });

  test("Learned/Decided lines only qualify past 12 captured characters", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs("wt1/2026-08-01.md"),
      "**Learned:** 123456789012\n**Decided:** 1234567890123\n",
      100,
    );

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    // exactly 12 chars is excluded ("longer than 12"); 13 chars qualifies.
    expect(candidates).toEqual([{ text: "1234567890123", src: "wt1/2026-08-01.md" }]);
  });

  test("dedupes candidates case-insensitively, keeping the first occurrence", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/a.md"), "#promote duplicate fact\n", 100);
    fs.seedFile(underWorklogs("wt1/b.md"), "#promote DUPLICATE FACT\n", 100);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([{ text: "duplicate fact", src: "wt1/a.md" }]);
  });

  test("sinceMs filters out files older than the cursor", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/old.md"), "#promote an old candidate here\n", 1000);
    fs.seedFile(underWorklogs("wt1/new.md"), "#promote a new candidate here\n", 5000);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 3000);

    expect(candidates).toEqual([{ text: "a new candidate here", src: "wt1/new.md" }]);
  });

  test("sinceMs === 0 (never yet run) applies no mtime filter at all", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/old.md"), "#promote an old candidate here\n", 1000);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([{ text: "an old candidate here", src: "wt1/old.md" }]);
  });

  test("skips STATE.md and the _proposals directory", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs("wt1/STATE.md"),
      "#promote should never be gathered\n",
      100,
    );
    fs.seedFile(
      underWorklogs("_proposals/2026-08-01.md"),
      "#promote should never be gathered either\n",
      100,
    );
    fs.seedFile(
      underWorklogs("wt1/2026-08-01.md"),
      "#promote the only real candidate\n",
      100,
    );

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([
      { text: "the only real candidate", src: "wt1/2026-08-01.md" },
    ]);
  });

  test("skips dot-prefixed directories", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underWorklogs(".hidden/2026-08-01.md"),
      "#promote hidden candidate\n",
      100,
    );
    fs.seedFile(underWorklogs("wt1/2026-08-01.md"), "#promote visible candidate\n", 100);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([{ text: "visible candidate", src: "wt1/2026-08-01.md" }]);
  });

  test("a worklogs entry that is a plain file, not a directory, contributes nothing", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(underWorklogs(""));
    fs.seedFile(underWorklogs("not-a-slug.md"), "#promote should be ignored\n", 100);
    fs.seedFile(underWorklogs("wt1/2026-08-01.md"), "#promote a real candidate\n", 100);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([{ text: "a real candidate", src: "wt1/2026-08-01.md" }]);
  });

  test("a missing worklogs directory yields no candidates", async () => {
    const fs = makeFsMemoryFake();

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([]);
  });

  test("a line with neither #promote nor a Learned/Decided field is ignored", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underWorklogs("wt1/2026-08-01.md"), "just a normal sentence\n", 100);

    const candidates = await gatherCandidates(fs, makeWorkspace(), 0);

    expect(candidates).toEqual([]);
  });
});
