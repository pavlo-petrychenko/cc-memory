import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import {
  InstallCommand,
  UninstallCommand,
} from "@/modules/installation/commands/install/install.command.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

function makeInstallCommand() {
  const proc = makeProcFake();
  proc.enqueue({
    kind: "resolve",
    result: { stdout: "/usr/bin/bun", stderr: "", exitCode: 0 },
  });
  proc.enqueue({
    kind: "resolve",
    result: { stdout: "/usr/bin/bun", stderr: "", exitCode: 0 },
  });
  const fs = makeFsMemoryFake();
  // SAFETY: a fixed literal test fixture path.
  fs.seedFile("/usr/bin/bun" as AbsPath, "");
  const container = makeTestGateways({ proc, fs });
  return new InstallCommand(container);
}

describe("InstallCommand", () => {
  test("--dry-run reports the dry-run banner without writing", async () => {
    const result = await makeInstallCommand().run({ dryRun: true }, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("dry run");
  });
});

describe("UninstallCommand", () => {
  test("nothing installed reports nothing to do", async () => {
    const command = new UninstallCommand(makeTestGateways({ proc: makeProcFake() }));
    const result = await command.run({}, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("nothing to uninstall");
  });
});
