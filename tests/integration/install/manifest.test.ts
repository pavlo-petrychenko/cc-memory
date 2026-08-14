import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import {
  defaultManifestPath,
  loadManifest,
  MANIFEST_SCHEMA_VERSION,
  saveManifest,
} from "../../../src/install/manifest.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixture, never a real filesystem lookup — matches
// `tests/helpers/container.ts`'s `DEFAULT_HOME`.
const HOME = "/home/test" as AbsPath;

describe("install/manifest.ts — ~/.claude/memory/installed.json", () => {
  test("defaultManifestPath is under ~/.claude/memory/", () => {
    // SAFETY: a fixed expected-value literal for a `toBe` assertion, not a
    // real path — same reasoning as `HOME` above.
    const expectedPath = "/home/test/.claude/memory/installed.json" as AbsPath;
    expect(defaultManifestPath(HOME)).toBe(expectedPath);
  });

  test("loadManifest is null when the file does not exist (first run)", async () => {
    const fs = makeFsMemoryFake();
    const manifest = await loadManifest(fs, defaultManifestPath(HOME));
    expect(manifest).toBeNull();
  });

  test("loadManifest is null for corrupt JSON (degrades to first-run, never throws)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultManifestPath(HOME), "not json {{{");
    const manifest = await loadManifest(fs, defaultManifestPath(HOME));
    expect(manifest).toBeNull();
  });

  test("loadManifest is null for valid JSON that doesn't match the schema", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultManifestPath(HOME), JSON.stringify({ unrelatedField: true }));
    const manifest = await loadManifest(fs, defaultManifestPath(HOME));
    expect(manifest).toBeNull();
  });

  test("save then load round-trips every field exactly", async () => {
    const fs = makeFsMemoryFake();
    const path = defaultManifestPath(HOME);
    await saveManifest(fs, path, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot: "/repo",
      bunPath: "/usr/local/bin/bun",
      distPath: "/repo/dist/memory.js",
      hookCommands: {
        SessionStart: "/usr/local/bin/bun /repo/dist/memory.js hook session-start",
      },
      shimPath: "/home/test/.local/bin/memory",
      skills: [{ name: "remember", backedUp: true }],
      launchdPlistPath: "/home/test/Library/LaunchAgents/dev.ccmemory.reflector.plist",
      settingsBackupPath: "/home/test/.claude/settings.json.pre-ccmemory.bak",
      legacyPurgeDone: true,
    });

    const loaded = await loadManifest(fs, path);
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
      launchdPlistPath: "/home/test/Library/LaunchAgents/dev.ccmemory.reflector.plist",
      settingsBackupPath: "/home/test/.claude/settings.json.pre-ccmemory.bak",
      legacyPurgeDone: true,
    });
  });

  test("save then load round-trips null launchd/backup paths and an empty skills list", async () => {
    const fs = makeFsMemoryFake();
    const path = defaultManifestPath(HOME);
    await saveManifest(fs, path, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot: "/repo",
      bunPath: "/usr/local/bin/bun",
      distPath: "/repo/dist/memory.js",
      hookCommands: {},
      shimPath: "/home/test/.local/bin/memory",
      skills: [],
      launchdPlistPath: null,
      settingsBackupPath: null,
      legacyPurgeDone: false,
    });

    const loaded = await loadManifest(fs, path);
    expect(loaded?.launchdPlistPath).toBeNull();
    expect(loaded?.settingsBackupPath).toBeNull();
    expect(loaded?.skills).toEqual([]);
    expect(loaded?.legacyPurgeDone).toBe(false);
  });

  test("loadManifest rejects a skills entry with the wrong shape", async () => {
    const fs = makeFsMemoryFake();
    const path = defaultManifestPath(HOME);
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
        launchdPlistPath: null,
        settingsBackupPath: null,
        legacyPurgeDone: false,
      }),
    );
    const manifest = await loadManifest(fs, path);
    expect(manifest).toBeNull();
  });

  test("loadManifest rejects a hookCommands value that isn't all strings", async () => {
    const fs = makeFsMemoryFake();
    const path = defaultManifestPath(HOME);
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
        launchdPlistPath: null,
        settingsBackupPath: null,
        legacyPurgeDone: false,
      }),
    );
    const manifest = await loadManifest(fs, path);
    expect(manifest).toBeNull();
  });
});
