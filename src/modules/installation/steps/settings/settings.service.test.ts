import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { SettingsService } from "@/modules/installation/steps/settings/settings.service.ts";
import { JsonFileService } from "@/modules/installation/utils/jsonFile/jsonFile.service.ts";
import type { JsonObject } from "@/modules/installation/utils/jsonFile/jsonFile.typedefs.ts";
import { HookEvent } from "@/modules/session/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

const BUN_PATH = "/usr/local/bin/bun";
const DIST_PATH = "/repo/dist/memory.js";

function buddyRerollGroup(): JsonObject {
  return {
    hooks: [
      { type: "command", command: "npx claude-plan-review stop-gate", timeout: 10 },
    ],
  };
}

/** `result.settings["hooks"]`, narrowed via the real type guard instead of a
 * cast — every assertion below already knows `surgerize` always writes an
 * object there. */
function hooksOf(settings: JsonObject): JsonObject {
  const hooks = settings["hooks"];
  if (hooks === undefined || !JsonFileService.isObject(hooks)) {
    throw new Error("expected settings.hooks to be an object");
  }
  return hooks;
}

describe("SettingsService — hookCommand / hookRegisteredLine / purgeSummaryLine", () => {
  test("hookCommand is '<bun> <dist> hook <name>'", () => {
    expect(SettingsService.hookCommand(BUN_PATH, DIST_PATH, "session-start")).toBe(
      "/usr/local/bin/bun /repo/dist/memory.js hook session-start",
    );
  });

  test("hookRegisteredLine formats the registration log line", () => {
    expect(
      SettingsService.hookRegisteredLine(HookEvent.SessionStart, "session-start"),
    ).toBe("hook SessionStart -> session-start");
  });

  test("purgeSummaryLine is null when nothing was purged", () => {
    expect(
      SettingsService.purgeSummaryLine({
        purgedByManifestCount: 0,
        purgedByLegacyCount: 0,
      }),
    ).toBeNull();
  });

  test("purgeSummaryLine uses singular 'entry' for exactly one purge", () => {
    expect(
      SettingsService.purgeSummaryLine({
        purgedByManifestCount: 1,
        purgedByLegacyCount: 0,
      }),
    ).toBe("purged 1 stale cc-memory/legacy hook entry");
  });

  test("purgeSummaryLine uses plural 'entries' and sums both counts", () => {
    expect(
      SettingsService.purgeSummaryLine({
        purgedByManifestCount: 2,
        purgedByLegacyCount: 3,
      }),
    ).toBe("purged 5 stale cc-memory/legacy hook entries");
  });
});

describe("SettingsService — commandsInGroup (tolerant of foreign shapes)", () => {
  test("returns [] for a group with no 'hooks' array", () => {
    expect(SettingsService.commandsInGroup({ notHooks: true })).toEqual([]);
  });

  test("returns [] for a non-object group", () => {
    expect(SettingsService.commandsInGroup("not a group")).toEqual([]);
    expect(SettingsService.commandsInGroup(null)).toEqual([]);
    expect(SettingsService.commandsInGroup(42)).toEqual([]);
  });

  test("collects every string 'command' field, skipping malformed entries", () => {
    const group: JsonObject = {
      hooks: [
        { type: "command", command: "a" },
        { type: "command" }, // missing command — skipped
        "not an object", // skipped
        { type: "command", command: "b" },
      ],
    };
    expect(SettingsService.commandsInGroup(group)).toEqual(["a", "b"]);
  });
});

describe("SettingsService — surgerize", () => {
  test("a settings.json with no 'hooks' key at all registers all 5 fresh", () => {
    const result = SettingsService.surgerize({}, new Set(), false, BUN_PATH, DIST_PATH);
    expect(result.summary).toEqual({ purgedByManifestCount: 0, purgedByLegacyCount: 0 });
    expect(Object.keys(hooksOf(result.settings))).toEqual([
      HookEvent.SessionStart,
      HookEvent.UserPromptSubmit,
      HookEvent.Stop,
      HookEvent.PostCompact,
      HookEvent.SessionEnd,
    ]);
    expect(result.hookCommands[HookEvent.SessionStart]).toBe(
      SettingsService.hookCommand(BUN_PATH, DIST_PATH, "session-start"),
    );
  });

  test("preserves every foreign entry byte-for-byte (buddy-reroll/plan-review)", () => {
    const before: JsonObject = {
      permissions: { allow: ["Bash(git *)"] },
      hooks: {
        EnterPlanMode: [buddyRerollGroup()],
        Stop: [buddyRerollGroup()],
      },
    };
    const result = SettingsService.surgerize(
      before,
      new Set(),
      false,
      BUN_PATH,
      DIST_PATH,
    );

    expect(result.settings["permissions"]).toEqual(before["permissions"]);
    const hooks = hooksOf(result.settings);
    expect(hooks["EnterPlanMode"]).toEqual([buddyRerollGroup()]);
    // Our new Stop group is APPENDED after the foreign one already there.
    expect(hooks["Stop"]).toEqual([
      buddyRerollGroup(),
      {
        hooks: [
          {
            type: "command",
            command: SettingsService.hookCommand(BUN_PATH, DIST_PATH, "wrap-gate"),
            timeout: 15,
          },
        ],
      },
    ]);
  });

  test("purges a former installation by manifest, regardless of path — no orphans after a move", () => {
    const oldBun = "/old/path/bun";
    const oldDist = "/old/repo/dist/memory.js";
    const before: JsonObject = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: SettingsService.hookCommand(oldBun, oldDist, "session-start"),
                timeout: 10,
              },
            ],
          },
        ],
      },
    };
    const manifestCommands = new Set([
      SettingsService.hookCommand(oldBun, oldDist, "session-start"),
    ]);

    const result = SettingsService.surgerize(
      before,
      manifestCommands,
      false,
      BUN_PATH,
      DIST_PATH,
    );

    expect(result.summary.purgedByManifestCount).toBe(1);
    const hooks = hooksOf(result.settings);
    expect(hooks["SessionStart"]).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: SettingsService.hookCommand(BUN_PATH, DIST_PATH, "session-start"),
            timeout: 10,
          },
        ],
      },
    ]);
  });

  test("cleans a legacy pre-manifest entry by substring, exactly once", () => {
    const before: JsonObject = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "/Users/dev/cc-memory/src/hooks/session-start.py",
                timeout: 10,
              },
            ],
          },
        ],
      },
    };

    const result = SettingsService.surgerize(
      before,
      new Set(),
      true,
      BUN_PATH,
      DIST_PATH,
    );

    expect(result.summary.purgedByLegacyCount).toBe(1);
    const hooks = hooksOf(result.settings);
    // The legacy entry is gone; only our fresh one remains.
    expect(hooks["SessionStart"]).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: SettingsService.hookCommand(BUN_PATH, DIST_PATH, "session-start"),
            timeout: 10,
          },
        ],
      },
    ]);
  });

  test("does NOT run the legacy substring purge when runLegacyPurge is false", () => {
    const before: JsonObject = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "/Users/dev/cc-memory/src/hooks/session-start.py",
                timeout: 10,
              },
            ],
          },
        ],
      },
    };

    const result = SettingsService.surgerize(
      before,
      new Set(),
      false,
      BUN_PATH,
      DIST_PATH,
    );

    expect(result.summary.purgedByLegacyCount).toBe(0);
    const hooks = hooksOf(result.settings);
    // The legacy (unrecognized-by-manifest) entry survives, plus our new one.
    expect(hooks["SessionStart"]).toHaveLength(2);
  });

  test("re-running with the SAME inputs is idempotent (identical settings.json)", () => {
    const manifestCommands = new Set<string>();
    const first = SettingsService.surgerize(
      {},
      manifestCommands,
      true,
      BUN_PATH,
      DIST_PATH,
    );
    const secondManifestCommands = new Set(Object.values(first.hookCommands));
    const second = SettingsService.surgerize(
      first.settings,
      secondManifestCommands,
      false, // legacyPurgeDone would now be true
      BUN_PATH,
      DIST_PATH,
    );

    expect(second.settings).toEqual(first.settings);
    expect(second.summary.purgedByManifestCount).toBe(5);
  });
});

describe("SettingsService — backupIfNeeded", () => {
  // SAFETY: fixed test fixtures, never a real filesystem lookup — matches
  // `testGateways.fixture.ts`'s `DEFAULT_HOME`.
  const settingsPath = "/home/test/.claude/settings.json" as AbsPath;
  // SAFETY: same reasoning as `settingsPath` above.
  const backupPath = "/home/test/.claude/settings.json.pre-ccmemory.bak" as AbsPath;

  test("does nothing when already backed up", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(settingsPath, '{"a":1}');
    const service = new SettingsService(fs);
    const didBackup = await service.backupIfNeeded(settingsPath, backupPath, true);
    expect(didBackup).toBe(false);
    expect(await fs.exists(backupPath)).toBe(false);
  });

  test("does nothing when settings.json doesn't exist yet", async () => {
    const fs = makeFsMemoryFake();
    const service = new SettingsService(fs);
    const didBackup = await service.backupIfNeeded(settingsPath, backupPath, false);
    expect(didBackup).toBe(false);
  });

  test("copies the raw bytes once, before the first write", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(settingsPath, '{"hooks":{}}');
    const service = new SettingsService(fs);
    const didBackup = await service.backupIfNeeded(settingsPath, backupPath, false);
    expect(didBackup).toBe(true);
    expect(await fs.readFile(backupPath)).toBe('{"hooks":{}}');
  });
});

describe("SettingsService — diffLines", () => {
  test("identical texts produce only context lines", () => {
    expect(SettingsService.diffLines("a\nb\n", "a\nb\n")).toEqual(["  a", "  b", "  "]);
  });

  test("an added line before the trailing (matching) empty line shows as '+'", () => {
    // `"a\n".split("\n")` is `["a", ""]`; the trailing `""` still matches on
    // both sides, so only `b` itself is a genuine addition.
    expect(SettingsService.diffLines("a\n", "a\nb\n")).toEqual(["  a", "+ b", "  "]);
  });

  test("a removed line before the trailing (matching) empty line shows as '-'", () => {
    expect(SettingsService.diffLines("a\nb\n", "a\n")).toEqual(["  a", "- b", "  "]);
  });

  test("a changed middle line shows as one removal plus one addition", () => {
    const lines = SettingsService.diffLines("a\nold\nc\n", "a\nnew\nc\n");
    expect(lines).toContain("- old");
    expect(lines).toContain("+ new");
    expect(lines[0]).toBe("  a");
    expect(lines.at(-1)).toBe("  ");
  });
});
