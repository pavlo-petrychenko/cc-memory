import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { DoctorCommand } from "@/modules/installation/commands/doctor/doctor.command.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const ctx = makeAppContext({ proc: makeProcFake() });
  const [handler] = registerCommands([DoctorCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("DoctorCommand", () => {
  test("prints the registry status and cwd resolution lines first", async () => {
    const result = await makeHandler().invoke([]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("registry:");
    expect(result.lines[1]).toContain("cwd ");
  });
});
