import { describe, expect, test } from "bun:test";

import { DoctorFormatter } from "@/install/doctor/doctor.formatter.ts";
import { WorkspaceIndexStatus } from "@/install/doctor/doctor.typedefs.ts";

describe("DoctorFormatter — render", () => {
  test("renders a STALE hook line and an OVERSIZED log line", () => {
    const lines = new DoctorFormatter().render({
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
      logSizeBytes: 2_000_000,
      logOversized: true,
      registryErrorMessage: null,
    });

    expect(lines).toContain("hook SessionStart: STALE");
    expect(lines).toContain("ccmem.log: 2000000 bytes (OVERSIZED)");
  });

  test("renders an UNREACHABLE index line without a note count", () => {
    const lines = new DoctorFormatter().render({
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
      logSizeBytes: 0,
      logOversized: false,
      registryErrorMessage: null,
    });

    expect(lines).toContain("  index: UNREACHABLE");
    expect(lines).toContain("install: not installed (no installed.json manifest found)");
  });
});
