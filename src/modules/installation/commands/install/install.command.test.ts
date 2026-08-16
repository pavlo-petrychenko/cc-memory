import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import {
  InstallCommand,
  UninstallCommand,
} from "@/modules/installation/commands/install/install.command.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeInstallHandler() {
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
  const ctx = makeAppContext({ proc, fs });
  const [handler] = registerCommands([InstallCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("InstallCommand", () => {
  test("--dry-run reports the dry-run banner without writing", async () => {
    const result = await makeInstallHandler().invoke(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("dry run");
  });
});

describe("UninstallCommand", () => {
  test("nothing installed reports nothing to do", async () => {
    const ctx = makeAppContext({ proc: makeProcFake() });
    const [handler] = registerCommands([UninstallCommand], ctx);
    if (handler === undefined) throw new Error("expected one command handler");
    const result = await handler.invoke([]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("nothing to uninstall");
  });
});
