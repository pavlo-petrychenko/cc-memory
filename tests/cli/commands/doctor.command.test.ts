import { describe, expect, test } from "bun:test";

import { CliCommand, type DoctorArgs } from "../../../src/cli/args.ts";
import { doctor } from "../../../src/cli/commands/doctor.command.ts";
import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../src/domain/paths.ts";
import type { RawWorkspace } from "../../../src/domain/Workspace.ts";
import { saveRegistry } from "../../../src/services/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeIoFake } from "../../helpers/fakes/ioFake.fake.ts";

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

describe("doctor (cmd_doctor basic version, bin/memory:212-250)", () => {
  test("an empty registry reports '(empty)' and 'no workspace'", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });

    const outcome = await doctor(container, doctorArgs({ cwd: "/repo/primary" }));
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

    const outcome = await doctor(container, doctorArgs({ cwd: "/repo/primary/wt1" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("registry: /home/test/.claude/memory/registry.toml (ok)");
    expect(io.written[1]).toBe("cwd /repo/primary/wt1 -> primary");
  });

  test("reports every hook as not yet implemented rather than fabricating output", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });

    await doctor(container, doctorArgs());
    const hookLines = io.written.filter((line) => line.includes("(not implemented yet)"));
    expect(hookLines).toHaveLength(5);
    expect(hookLines[0]).toBe("  session-start: (not implemented yet)");
  });

  test("a present-but-malformed registry falls back to '(empty)' rather than throwing", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await container.fs.writeFile(REGISTRY_PATH, "not toml [[[");

    const outcome = await doctor(container, doctorArgs());
    expect(outcome.exitCode).toBe(0);
    expect(io.written[0]).toContain("(empty)");
  });
});
