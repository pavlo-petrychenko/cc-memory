import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/domain/AbsPath.ts";
import type { Workspace } from "../../../../src/domain/Workspace.ts";
import {
  gatherDoctorReport,
  renderDoctorReport,
  WorkspaceIndexStatus,
} from "../../../../src/services/doctor.service.ts";
import {
  defaultManifestPath,
  saveManifest,
} from "../../../../src/services/install/manifest.ts";
import { hookCommand } from "../../../../src/services/install/settings.ts";
import { defaultSettingsPath } from "../../../../src/services/install/settings.ts";
import { RegistryErrorKind } from "../../../../src/services/registry.service.ts";
import { makeTestContainer } from "../../../helpers/container.ts";
import { makeProcFake } from "../../../helpers/fakes/procFake.fake.ts";

/**
 * `doctor.service.ts` — real diagnostics, replacing Python's hook-spawning
 * smoke test (this file's own doc comment explains why). Every failure
 * class the packet's "Tests" section names gets its own case: unparseable
 * registry, missing kb, stale hook paths, missing bun, oversized log.
 */

/** Cast a fixed test literal to `AbsPath` — every call site below is a
 * hard-coded test fixture, never a real filesystem path. */
function fixturePath(literal: string): AbsPath {
  // SAFETY: see the doc comment above.
  return literal as AbsPath;
}

const REPO_ROOT = fixturePath("/repo");

function workspaceFixture(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "primary",
    match: [fixturePath("/repo-checkout")],
    kb: fixturePath("/vault-primary"),
    worklogs: fixturePath("/vault-primary/_Worklogs"),
    exclude: [],
    indexDb: fixturePath(":memory:"),
    matchedPrefix: fixturePath("/repo-checkout"),
    ...overrides,
  };
}

describe("doctor.service.ts — per-workspace diagnostics", () => {
  test("a fully healthy workspace reports ok kb/worklogs and an ok, empty index", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    await container.fs.mkdir(workspaceFixture().kb);
    await container.fs.mkdir(workspaceFixture().worklogs);

    const report = await gatherDoctorReport(container, [workspaceFixture()], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces).toEqual([
      {
        id: "primary",
        kbExists: true,
        worklogsExist: true,
        indexStatus: WorkspaceIndexStatus.Ok,
        noteCount: 0,
        wrapStateBytes: 0,
        injectLogBytes: 0,
      },
    ]);
  });

  test("reports MISSING for a kb/worklogs directory that was never created", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    // Neither directory is created this time.

    const report = await gatherDoctorReport(container, [workspaceFixture()], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.kbExists).toBe(false);
    expect(report.workspaces[0]?.worklogsExist).toBe(false);
  });

  test("reports the index as unreachable rather than throwing, when the db can't be opened", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    // A real (never-faked) `bun:sqlite` handle, pointed at a REAL path whose
    // parent directory does not exist on the real filesystem — `fs.mkdir`
    // above only creates it in the in-memory FAKE, so the real sqlite open
    // genuinely fails, exactly the way a corrupted/unreadable index would.
    const brokenWorkspace = workspaceFixture({
      indexDb: fixturePath("/nonexistent-doctor-test-dir-xyz/index.db"),
    });

    const report = await gatherDoctorReport(container, [brokenWorkspace], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.indexStatus).toBe(WorkspaceIndexStatus.Unreachable);
    expect(report.workspaces[0]?.noteCount).toBeNull();
  });

  test("reports wrap-state.json / inject.jsonl sizes from beside the index db", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    await container.fs.writeFile(fixturePath("/wsdir/wrap-state.json"), "{}");
    await container.fs.writeFile(fixturePath("/wsdir/inject.jsonl"), "one\ntwo\n");
    const workspace = workspaceFixture({ indexDb: fixturePath("/wsdir/index.db") });

    const report = await gatherDoctorReport(container, [workspace], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.wrapStateBytes).toBe(2);
    expect(report.workspaces[0]?.injectLogBytes).toBe(8);
  });
});

describe("doctor.service.ts — install/hooks/bun/launchd diagnostics", () => {
  test("hooks is null (and bun unreported) when there is no installed.json manifest", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.hooks).toBeNull();
    expect(report.recordedBunPath).toBeNull();
    expect(report.bunPathExists).toBe(false);
  });

  test("reports the recorded bun path missing when the file no longer exists", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    await saveManifest(container.fs, defaultManifestPath(container.env.home()), {
      schemaVersion: 1,
      repoRoot: REPO_ROOT,
      bunPath: "/usr/local/bin/bun-that-was-uninstalled",
      distPath: `${REPO_ROOT}/dist/memory.js`,
      hookCommands: {},
      shimPath: "/home/test/.local/bin/memory",
      skills: [],
      launchdPlistPath: null,
      settingsBackupPath: null,
      legacyPurgeDone: true,
    });

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.recordedBunPath).toBe("/usr/local/bin/bun-that-was-uninstalled");
    expect(report.bunPathExists).toBe(false);
  });

  test("reports a hook STALE when settings.json's dist path doesn't match the current repo root", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    const bunPath = "/usr/local/bin/bun";
    await saveManifest(container.fs, defaultManifestPath(container.env.home()), {
      schemaVersion: 1,
      repoRoot: "/old-repo",
      bunPath,
      distPath: "/old-repo/dist/memory.js",
      hookCommands: {},
      shimPath: "/home/test/.local/bin/memory",
      skills: [],
      launchdPlistPath: null,
      settingsBackupPath: null,
      legacyPurgeDone: true,
    });
    await container.fs.writeFile(
      defaultSettingsPath(container.env.home()),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand(
                    bunPath,
                    "/old-repo/dist/memory.js",
                    "session-start",
                  ),
                  timeout: 10,
                },
              ],
            },
          ],
        },
      }),
    );

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT, // the CURRENT repo root — different from settings.json's
      registryError: null,
    });

    expect(report.hooks).not.toBeNull();
    const sessionStart = report.hooks?.find((hook) => hook.event === "SessionStart");
    expect(sessionStart?.upToDate).toBe(false);
  });

  test("reports a hook ok when settings.json already points at the current bun/dist", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    const bunPath = "/usr/local/bin/bun";
    const distPath = `${REPO_ROOT}/dist/memory.js`;
    await saveManifest(container.fs, defaultManifestPath(container.env.home()), {
      schemaVersion: 1,
      repoRoot: REPO_ROOT,
      bunPath,
      distPath,
      hookCommands: {},
      shimPath: "/home/test/.local/bin/memory",
      skills: [],
      launchdPlistPath: null,
      settingsBackupPath: null,
      legacyPurgeDone: true,
    });
    await container.fs.writeFile(
      defaultSettingsPath(container.env.home()),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand(bunPath, distPath, "session-start"),
                  timeout: 10,
                },
              ],
            },
          ],
        },
      }),
    );

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    const sessionStart = report.hooks?.find((hook) => hook.event === "SessionStart");
    expect(sessionStart?.upToDate).toBe(true);
  });

  test("reports launchd loaded/not-loaded from the real (procFake-scripted) launchctl", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "501\n", stderr: "", exitCode: 0 },
    });
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "not found", exitCode: 1 },
    });
    const container = makeTestContainer({ proc });

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.launchdLoaded).toBe(false);
  });

  test("flags an oversized ccmem.log", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    const oversizedContent = "x".repeat(1_048_577);
    await container.fs.writeFile(
      fixturePath("/home/test/.claude/memory/ccmem.log"),
      oversizedContent,
    );

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.logOversized).toBe(true);
  });

  test("carries a registry parse error through for rendering", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });

    const report = await gatherDoctorReport(container, [], {
      repoRoot: REPO_ROOT,
      registryError: { kind: RegistryErrorKind.ParseError, message: "bad toml" },
    });

    expect(report.registryErrorMessage).toBe("bad toml");
  });
});

describe("doctor.service.ts — renderDoctorReport", () => {
  test("renders a STALE hook line and an OVERSIZED log line", () => {
    const lines = renderDoctorReport({
      workspaces: [],
      hooks: [
        {
          event: "SessionStart",
          hookName: "session-start",
          registeredCommands: [],
          expectedCommand: "bun dist/memory.js hook session-start",
          upToDate: false,
        },
      ],
      recordedBunPath: "/usr/local/bin/bun",
      bunPathExists: true,
      launchdLoaded: true,
      logSizeBytes: 2_000_000,
      logOversized: true,
      registryErrorMessage: null,
    });

    expect(lines).toContain("hook SessionStart: STALE");
    expect(lines).toContain("ccmem.log: 2000000 bytes (OVERSIZED)");
  });

  test("renders an UNREACHABLE index line without a note count", () => {
    const lines = renderDoctorReport({
      workspaces: [
        {
          id: "primary",
          kbExists: true,
          worklogsExist: true,
          indexStatus: WorkspaceIndexStatus.Unreachable,
          noteCount: null,
          wrapStateBytes: 0,
          injectLogBytes: 0,
        },
      ],
      hooks: null,
      recordedBunPath: null,
      bunPathExists: false,
      launchdLoaded: false,
      logSizeBytes: 0,
      logOversized: false,
      registryErrorMessage: null,
    });

    expect(lines).toContain("  index: UNREACHABLE");
    expect(lines).toContain("install: not installed (no installed.json manifest found)");
  });
});
