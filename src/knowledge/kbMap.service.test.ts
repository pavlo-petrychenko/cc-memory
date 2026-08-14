import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import { makeFsMemoryFake } from "../testing/fakes/fsMemory.fake.ts";
import { buildKbMapInput } from "./kbMap.service.ts";

/**
 * `buildKbMapInput` — the filesystem-facing half of building the KB map
 * that gets injected on session start. Not itself a hook (it has no
 * event/payload), but exercised only through `sessionStart.hook.ts`, so its
 * own edge cases live alongside the hook contract tests rather than
 * duplicating a fixture per case there.
 */

// SAFETY: fixed test fixtures.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const KB = "/home/test/vault-primary" as AbsPath;

/** `KB` plus a fixed literal relative fragment — every call site below passes
 * a hard-coded string, never external input. */
function underKb(relativePath: string): AbsPath {
  const joined = `${KB}/${relativePath}`;
  // SAFETY: see the doc comment above.
  return joined as AbsPath;
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "primary",
    match: [KB],
    kb: KB,
    worklogs: underKb("_Worklogs"),
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    // SAFETY: `bun:sqlite`'s own special literal for an in-memory database —
    // never touches a real `.claude/memory/**/index.db` file (CLAUDE.md's
    // "never fake `SqlDatabase`" rule still applies, but `buildKbMapInput` never opens
    // this path at all — it's unused by anything under test here).
    indexDb: ":memory:" as AbsPath,
    matchedPrefix: KB,
    ...overrides,
  };
}

describe("buildKbMapInput", () => {
  test("vault directory missing: null", async () => {
    const fs = makeFsMemoryFake();
    const workspace = makeWorkspace();

    expect(await buildKbMapInput(fs, workspace, HOME)).toBeNull();
  });

  test("a feature dir with a full index note: title/description/epic all present", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      underKb("Alpha/Alpha.md"),
      "---\ntype: index\nepic: 'ENG-1'\n---\n# Alpha Feature\n> Index for Alpha.\n",
    );
    const workspace = makeWorkspace();

    const result = await buildKbMapInput(fs, workspace, HOME);
    expect(result).not.toBeNull();
    expect(result?.vaultLabel).toBe("~/vault-primary");
    expect(result?.features).toEqual([
      {
        name: "Alpha",
        hasIndexNote: true,
        title: "Alpha Feature",
        description: "Index for Alpha.",
        epic: "ENG-1",
      },
    ]);
  });

  test("a feature dir with no index note at all", async () => {
    const fs = makeFsMemoryFake();
    // `seedDir` (unlike `seedFile`/`mkdir`) does not create parent
    // directories, so `KB` itself needs seeding too when nothing under it is
    // a `seedFile` call.
    fs.seedDir(KB);
    fs.seedDir(underKb("Beta"));
    const workspace = makeWorkspace();

    const result = await buildKbMapInput(fs, workspace, HOME);
    expect(result?.features).toEqual([
      { name: "Beta", hasIndexNote: false, title: "", description: "", epic: "" },
    ]);
  });

  test("hidden dirs and excluded dirs are skipped as features", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(underKb(".obsidian"));
    fs.seedDir(underKb("_Worklogs"));
    fs.seedFile(underKb("Gamma/Gamma.md"), "# Gamma\n");
    const workspace = makeWorkspace();

    const result = await buildKbMapInput(fs, workspace, HOME);
    expect(result?.features.map((feature) => feature.name)).toEqual(["Gamma"]);
  });

  test("loose top-level notes exclude daily journal filenames", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(underKb("Roadmap.md"), "# Roadmap\n");
    fs.seedFile(underKb("2026-01-01.md"), "## entry\n");
    const workspace = makeWorkspace();

    const result = await buildKbMapInput(fs, workspace, HOME);
    expect(result?.looseNotes).toEqual(["Roadmap"]);
  });

  test("entries sort case-insensitively (str.lower key)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(KB);
    fs.seedDir(underKb("zebra"));
    fs.seedDir(underKb("Apple"));
    const workspace = makeWorkspace();

    const result = await buildKbMapInput(fs, workspace, HOME);
    expect(result?.features.map((feature) => feature.name)).toEqual(["Apple", "zebra"]);
  });
});
