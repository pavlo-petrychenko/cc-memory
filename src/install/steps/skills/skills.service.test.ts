import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { SkillsService } from "@/install/steps/skills/skills.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — matches
// `testContainer.fixture.ts`'s `DEFAULT_HOME`.
const SOURCE_DIR = "/repo/src/skills" as AbsPath;
// SAFETY: same reasoning as `SOURCE_DIR` above.
const TARGET_DIR = "/home/test/.claude/skills" as AbsPath;

/** Join a fixed test literal onto a fixed test path — every call site below
 * concatenates two already-fixed fixtures, never a real filesystem path. */
function fixturePath(...segments: readonly string[]): AbsPath {
  // SAFETY: see the doc comment above.
  return segments.join("") as AbsPath;
}

describe("SkillsService — symlinking src/skills into ~/.claude/skills", () => {
  test("discoverNames returns [] when the source directory doesn't exist", async () => {
    const fs = makeFsMemoryFake();
    const service = new SkillsService(fs);
    expect(await service.discoverNames(SOURCE_DIR)).toEqual([]);
  });

  test("discoverNames returns only directories, sorted", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(fixturePath(SOURCE_DIR, "/remember"));
    fs.seedDir(fixturePath(SOURCE_DIR, "/save-learning"));
    fs.seedFile(fixturePath(SOURCE_DIR, "/README.md"), "not a skill");
    const service = new SkillsService(fs);

    const names = await service.discoverNames(SOURCE_DIR);

    expect(names).toEqual(["remember", "save-learning"]);
  });

  test("a brand-new skill (no manifest entry, nothing pre-existing) is symlinked with backedUp: false", async () => {
    const fs = makeFsMemoryFake();
    const service = new SkillsService(fs);
    const outcome = await service.install(SOURCE_DIR, TARGET_DIR, ["remember"], []);

    expect(outcome.skills).toEqual([{ name: "remember", backedUp: false }]);
    expect(outcome.actionLines).toEqual(["skill remember"]);
    expect(await fs.exists(fixturePath(TARGET_DIR, "/remember"))).toBe(true);
  });

  test("a pre-existing REAL directory (not ours) is backed up once, then replaced", async () => {
    const fs = makeFsMemoryFake();
    const targetPath = fixturePath(TARGET_DIR, "/remember");
    fs.seedFile(fixturePath(targetPath, "/SKILL.md"), "a real, foreign skill file");
    const service = new SkillsService(fs);

    const outcome = await service.install(SOURCE_DIR, TARGET_DIR, ["remember"], []);

    expect(outcome.skills).toEqual([{ name: "remember", backedUp: true }]);
    // The backup now holds what used to be at `targetPath`.
    expect(
      await fs.exists(fixturePath(targetPath, ".pre-ccmemory.bak", "/SKILL.md")),
    ).toBe(true);
    // `targetPath` itself is now our fresh symlink, not the old real content.
    expect(await fs.exists(fixturePath(targetPath, "/SKILL.md"))).toBe(false);
  });

  test("a second real directory at the same name (backup already exists) is removed, not backed up again", async () => {
    const fs = makeFsMemoryFake();
    const targetPath = fixturePath(TARGET_DIR, "/remember");
    fs.seedFile(
      fixturePath(targetPath, ".pre-ccmemory.bak", "/SKILL.md"),
      "the first backup",
    );
    fs.seedFile(
      fixturePath(targetPath, "/SKILL.md"),
      "a second, unrelated real directory",
    );
    const service = new SkillsService(fs);

    const outcome = await service.install(SOURCE_DIR, TARGET_DIR, ["remember"], []);

    expect(outcome.skills).toEqual([{ name: "remember", backedUp: true }]);
    // The original backup is untouched — never overwritten by a second one.
    expect(
      await fs.exists(fixturePath(targetPath, ".pre-ccmemory.bak", "/SKILL.md")),
    ).toBe(true);
  });

  test("a skill already recorded in the manifest, still linked, is left alone", async () => {
    const fs = makeFsMemoryFake();
    const targetPath = fixturePath(TARGET_DIR, "/remember");
    await fs.symlink(fixturePath(SOURCE_DIR, "/remember"), targetPath);
    const service = new SkillsService(fs);

    const outcome = await service.install(
      SOURCE_DIR,
      TARGET_DIR,
      ["remember"],
      [{ name: "remember", backedUp: false }],
    );

    // Trusted from the manifest — no backup attempted even though the
    // (fake) symlink "file" technically exists at that path.
    expect(outcome.skills).toEqual([{ name: "remember", backedUp: false }]);
    expect(await fs.exists(fixturePath(targetPath, ".pre-ccmemory.bak"))).toBe(false);
  });

  test("a skill already in the manifest but deleted by hand is re-linked", async () => {
    const fs = makeFsMemoryFake();
    const targetPath = fixturePath(TARGET_DIR, "/remember");
    const service = new SkillsService(fs);

    const outcome = await service.install(
      SOURCE_DIR,
      TARGET_DIR,
      ["remember"],
      [{ name: "remember", backedUp: false }],
    );

    expect(outcome.skills).toEqual([{ name: "remember", backedUp: false }]);
    expect(await fs.exists(targetPath)).toBe(true);
  });

  test("multiple skills all get processed, each with its own outcome", async () => {
    const fs = makeFsMemoryFake();
    const service = new SkillsService(fs);
    const outcome = await service.install(
      SOURCE_DIR,
      TARGET_DIR,
      ["memory-search", "remember"],
      [],
    );

    expect(outcome.skills.map((skill) => skill.name)).toEqual([
      "memory-search",
      "remember",
    ]);
    expect(outcome.actionLines).toEqual(["skill memory-search", "skill remember"]);
  });
});
