import { describe, expect, test } from "bun:test";

import { CliCommand, type DoctorArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { DoctorCommand } from "@/install/commands/doctor/doctor.command.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "@/workspace/index.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function doctorArgs(overrides: Partial<DoctorArgs> = {}): DoctorArgs {
  return { command: CliCommand.Doctor, cwd: null, prompt: null, ...overrides };
}

/**
 * `DoctorCommand` (`src/install/commands/doctor/doctor.command.ts`) runs
 * real diagnostics — see `doctor/doctor.service.ts`'s doc comment for why
 * this is a redesign rather than spawning hooks to smoke-test them. The
 * first two lines are the one thing kept BYTE-IDENTICAL (they are the first
 * thing a human reads, even while skipped).
 */
describe("DoctorCommand (real diagnostics, replacing the exit-0 hook smoke test)", () => {
  test("an empty registry reports '(empty)' and 'no workspace'", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });

    const outcome = await new DoctorCommand(container).execute(
      doctorArgs({ cwd: "/repo/primary" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe(
      "registry: /home/test/.claude/memory/registry.toml (empty)",
    );
    expect(io.written[1]).toBe("cwd /repo/primary -> no workspace");
  });

  test("a populated registry reports '(ok)' and the resolved workspace id", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await new DoctorCommand(container).execute(
      doctorArgs({ cwd: "/repo/primary/wt1" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("registry: /home/test/.claude/memory/registry.toml (ok)");
    expect(io.written[1]).toBe("cwd /repo/primary/wt1 -> primary");
  });

  test("a present-but-malformed registry falls back to '(empty)' AND reports the parse error", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await container.fs.writeFile(REGISTRY_PATH, "not toml [[[");

    const outcome = await new DoctorCommand(container).execute(doctorArgs());
    expect(outcome.exitCode).toBe(0);
    expect(io.written[0]).toContain("(empty)");
    expect(io.written.some((line) => line.startsWith("registry error:"))).toBe(true);
  });

  test("reports a registered workspace's vault and index health", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    // SAFETY: fixed test fixture paths, matching `PRIMARY.kb`/`.worklogs` above.
    const kbPath = "/vault-primary" as AbsPath;
    // SAFETY: same reasoning as `kbPath` above.
    const worklogsPath = "/vault-primary/_Worklogs" as AbsPath;
    await container.fs.mkdir(kbPath);
    await container.fs.mkdir(worklogsPath);
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    await new DoctorCommand(container).execute(doctorArgs());

    expect(io.written).toContain("workspace primary:");
    expect(io.written).toContain("  kb: ok");
    expect(io.written).toContain("  worklogs: ok");
    expect(io.written.some((line) => line.startsWith("  index: "))).toBe(true);
  });

  test("reports a missing kb/worklogs directory rather than fabricating success", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);
    // Neither `/vault-primary` nor its `_Worklogs` was ever created.

    await new DoctorCommand(container).execute(doctorArgs());

    expect(io.written).toContain("  kb: MISSING");
    expect(io.written).toContain("  worklogs: MISSING");
  });

  test("reports 'not installed' when there is no installed.json manifest", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });

    await new DoctorCommand(container).execute(doctorArgs());

    expect(io.written).toContain(
      "install: not installed (no installed.json manifest found)",
    );
  });

  test("always reports a ccmem.log size line, even when nothing has ever been logged", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });

    await new DoctorCommand(container).execute(doctorArgs());

    expect(io.written.some((line) => line.startsWith("ccmem.log: 0 bytes"))).toBe(true);
  });
});
