import { expect, test } from "bun:test";

import type { Installation } from "@/modules/installation/installation.entity.ts";

test("an Installation records exactly what the installer wrote", () => {
  const installation: Installation = {
    schemaVersion: 1,
    repoRoot: "/repo",
    bunPath: "/usr/bin/bun",
    distPath: "/repo/dist/memory.js",
    hookCommands: {
      SessionStart: "/usr/bin/bun /repo/dist/memory.js hook session-start",
    },
    shimPath: "/home/test/.local/bin/memory",
    skills: [{ name: "memory-search", backedUp: false }],
    settingsBackupPath: null,
    legacyPurgeDone: true,
  };

  expect(installation.skills).toEqual([{ name: "memory-search", backedUp: false }]);
  expect(installation.legacyPurgeDone).toBe(true);
});
