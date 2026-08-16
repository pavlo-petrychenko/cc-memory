import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { WorkspaceIndexStatus } from "@/modules/installation/doctor/doctor.typedefs.ts";
import { DoctorService } from "@/modules/installation/doctor/doctor.useCase.ts";
import { ManifestService } from "@/modules/installation/steps/manifest/manifest.repository.ts";
import { SettingsService } from "@/modules/installation/steps/settings/settings.repository.ts";
import type { NoteService } from "@/modules/note/index.ts";
import type { WorklogService } from "@/modules/worklog/index.ts";
import { RegistryErrorKind } from "@/modules/workspace/index.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import {
  makeNoteModule,
  makeSearchIndex,
  makeWorklogModule,
} from "@/testing/fixtures/retrievalModules.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

function makeDoctorUseCases(container: Gateways): [NoteService, WorklogService] {
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);
  return [note.noteService, worklog.worklogService];
}

/**
 * `DoctorService` — real diagnostics. Every failure class gets its own
 * case: unparseable registry, missing kb, stale hook paths, missing bun,
 * oversized log.
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

describe("DoctorService — per-workspace diagnostics", () => {
  test("a fully healthy workspace reports ok kb/worklogs and an ok, empty index", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    await container.fs.mkdir(workspaceFixture().kb);
    await container.fs.mkdir(workspaceFixture().worklogs);

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([workspaceFixture()], {
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
    const container = makeTestGateways({ proc: makeProcFake() });
    // Neither directory is created this time.

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([workspaceFixture()], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.kbExists).toBe(false);
    expect(report.workspaces[0]?.worklogsExist).toBe(false);
  });

  test("reports the index as unreachable rather than throwing, when the db can't be opened", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    // A real (never-faked) `bun:sqlite` handle, pointed at a REAL path whose
    // parent directory does not exist on the real filesystem — `fs.mkdir`
    // above only creates it in the in-memory FAKE, so the real sqlite open
    // genuinely fails, exactly the way a corrupted/unreadable index would.
    const brokenWorkspace = workspaceFixture({
      indexDb: fixturePath("/nonexistent-doctor-test-dir-xyz/index.db"),
    });

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([brokenWorkspace], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.indexStatus).toBe(WorkspaceIndexStatus.Unreachable);
    expect(report.workspaces[0]?.noteCount).toBeNull();
  });

  test("reports wrap-state.json / inject.jsonl sizes from beside the index db", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    await container.fs.writeFile(fixturePath("/wsdir/wrap-state.json"), "{}");
    await container.fs.writeFile(fixturePath("/wsdir/inject.jsonl"), "one\ntwo\n");
    const workspace = workspaceFixture({ indexDb: fixturePath("/wsdir/index.db") });

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([workspace], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.workspaces[0]?.wrapStateBytes).toBe(2);
    expect(report.workspaces[0]?.injectLogBytes).toBe(8);
  });
});

describe("DoctorService — install/hooks/bun diagnostics", () => {
  test("hooks is null (and bun unreported) when there is no installed.json manifest", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.hooks).toBeNull();
    expect(report.recordedBunPath).toBeNull();
    expect(report.bunPathExists).toBe(false);
  });

  test("reports the recorded bun path missing when the file no longer exists", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    await new ManifestService(container.fs).save(
      ManifestService.defaultPath(container.env.home()),
      {
        schemaVersion: 1,
        repoRoot: REPO_ROOT,
        bunPath: "/usr/local/bin/bun-that-was-uninstalled",
        distPath: `${REPO_ROOT}/dist/memory.js`,
        hookCommands: {},
        shimPath: "/home/test/.local/bin/memory",
        skills: [],
        settingsBackupPath: null,
        legacyPurgeDone: true,
      },
    );

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.recordedBunPath).toBe("/usr/local/bin/bun-that-was-uninstalled");
    expect(report.bunPathExists).toBe(false);
  });

  test("reports a hook STALE when settings.json's dist path doesn't match the current repo root", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    const bunPath = "/usr/local/bin/bun";
    await new ManifestService(container.fs).save(
      ManifestService.defaultPath(container.env.home()),
      {
        schemaVersion: 1,
        repoRoot: "/old-repo",
        bunPath,
        distPath: "/old-repo/dist/memory.js",
        hookCommands: {},
        shimPath: "/home/test/.local/bin/memory",
        skills: [],
        settingsBackupPath: null,
        legacyPurgeDone: true,
      },
    );
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: SettingsService.hookCommand(
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

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT, // the CURRENT repo root — different from settings.json's
      registryError: null,
    });

    expect(report.hooks).not.toBeNull();
    const sessionStart = report.hooks?.find((hook) => hook.event === "SessionStart");
    expect(sessionStart?.upToDate).toBe(false);
  });

  test("reports a hook ok when settings.json already points at the current bun/dist", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    const bunPath = "/usr/local/bin/bun";
    const distPath = `${REPO_ROOT}/dist/memory.js`;
    await new ManifestService(container.fs).save(
      ManifestService.defaultPath(container.env.home()),
      {
        schemaVersion: 1,
        repoRoot: REPO_ROOT,
        bunPath,
        distPath,
        hookCommands: {},
        shimPath: "/home/test/.local/bin/memory",
        skills: [],
        settingsBackupPath: null,
        legacyPurgeDone: true,
      },
    );
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: SettingsService.hookCommand(
                    bunPath,
                    distPath,
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

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    const sessionStart = report.hooks?.find((hook) => hook.event === "SessionStart");
    expect(sessionStart?.upToDate).toBe(true);
  });

  test("flags an oversized ccmem.log", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    const oversizedContent = "x".repeat(1_048_577);
    await container.fs.writeFile(
      fixturePath("/home/test/.claude/memory/ccmem.log"),
      oversizedContent,
    );

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT,
      registryError: null,
    });

    expect(report.logOversized).toBe(true);
  });

  test("carries a registry parse error through for rendering", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });

    const report = await new DoctorService(
      container,
      ...makeDoctorUseCases(container),
    ).gatherReport([], {
      repoRoot: REPO_ROOT,
      registryError: { kind: RegistryErrorKind.ParseError, message: "bad toml" },
    });

    expect(report.registryErrorMessage).toBe("bad toml");
  });
});
