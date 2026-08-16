import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { MANIFEST_SCHEMA_VERSION } from "@/modules/installation/steps/manifest/manifest.constants.ts";
import { ManifestService } from "@/modules/installation/steps/manifest/manifest.repository.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixture, never a real filesystem lookup — matches
// `testGateways.fixture.ts`'s `DEFAULT_HOME`.
const HOME = "/home/test" as AbsPath;

describe("ManifestService — ~/.claude/memory/installed.json", () => {
  test("defaultPath is under ~/.claude/memory/", () => {
    // SAFETY: a fixed expected-value literal for a `toBe` assertion, not a
    // real path — same reasoning as `HOME` above.
    const expectedPath = "/home/test/.claude/memory/installed.json" as AbsPath;
    expect(ManifestService.defaultPath(HOME)).toBe(expectedPath);
  });

  test("load is null when the file does not exist (first run)", async () => {
    const fs = makeFsMemoryFake();
    const service = new ManifestService(fs);
    const manifest = await service.load(ManifestService.defaultPath(HOME));
    expect(manifest).toBeNull();
  });

  test("load is null for corrupt JSON (degrades to first-run, never throws)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(ManifestService.defaultPath(HOME), "not json {{{");
    const service = new ManifestService(fs);
    const manifest = await service.load(ManifestService.defaultPath(HOME));
    expect(manifest).toBeNull();
  });

  test("load is null for valid JSON that doesn't match the schema", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      ManifestService.defaultPath(HOME),
      JSON.stringify({ unrelatedField: true }),
    );
    const service = new ManifestService(fs);
    const manifest = await service.load(ManifestService.defaultPath(HOME));
    expect(manifest).toBeNull();
  });

  test("save then load round-trips every field exactly", async () => {
    const fs = makeFsMemoryFake();
    const service = new ManifestService(fs);
    const path = ManifestService.defaultPath(HOME);
    await service.save(path, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot: "/repo",
      bunPath: "/usr/local/bin/bun",
      distPath: "/repo/dist/memory.js",
      hookCommands: {
        SessionStart: "/usr/local/bin/bun /repo/dist/memory.js hook session-start",
      },
      shimPath: "/home/test/.local/bin/memory",
      skills: [{ name: "remember", backedUp: true }],
      settingsBackupPath: "/home/test/.claude/settings.json.pre-ccmemory.bak",
      legacyPurgeDone: true,
    });

    const loaded = await service.load(path);
    expect(loaded).toEqual({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot: "/repo",
      bunPath: "/usr/local/bin/bun",
      distPath: "/repo/dist/memory.js",
      hookCommands: {
        SessionStart: "/usr/local/bin/bun /repo/dist/memory.js hook session-start",
      },
      shimPath: "/home/test/.local/bin/memory",
      skills: [{ name: "remember", backedUp: true }],
      settingsBackupPath: "/home/test/.claude/settings.json.pre-ccmemory.bak",
      legacyPurgeDone: true,
    });
  });

  test("save then load round-trips a null backup path and an empty skills list", async () => {
    const fs = makeFsMemoryFake();
    const service = new ManifestService(fs);
    const path = ManifestService.defaultPath(HOME);
    await service.save(path, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot: "/repo",
      bunPath: "/usr/local/bin/bun",
      distPath: "/repo/dist/memory.js",
      hookCommands: {},
      shimPath: "/home/test/.local/bin/memory",
      skills: [],
      settingsBackupPath: null,
      legacyPurgeDone: false,
    });

    const loaded = await service.load(path);
    expect(loaded?.settingsBackupPath).toBeNull();
    expect(loaded?.skills).toEqual([]);
    expect(loaded?.legacyPurgeDone).toBe(false);
  });

  test("load rejects a skills entry with the wrong shape", async () => {
    const fs = makeFsMemoryFake();
    const service = new ManifestService(fs);
    const path = ManifestService.defaultPath(HOME);
    await fs.writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        repoRoot: "/repo",
        bunPath: "/bun",
        distPath: "/dist",
        hookCommands: {},
        shimPath: "/shim",
        skills: [{ name: "x" }], // missing `backedUp`
        settingsBackupPath: null,
        legacyPurgeDone: false,
      }),
    );
    const manifest = await service.load(path);
    expect(manifest).toBeNull();
  });

  test("load rejects a hookCommands value that isn't all strings", async () => {
    const fs = makeFsMemoryFake();
    const service = new ManifestService(fs);
    const path = ManifestService.defaultPath(HOME);
    await fs.writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        repoRoot: "/repo",
        bunPath: "/bun",
        distPath: "/dist",
        hookCommands: { SessionStart: 42 },
        shimPath: "/shim",
        skills: [],
        settingsBackupPath: null,
        legacyPurgeDone: false,
      }),
    );
    const manifest = await service.load(path);
    expect(manifest).toBeNull();
  });
});
