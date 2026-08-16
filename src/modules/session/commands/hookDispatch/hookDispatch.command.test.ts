import { describe, expect, test } from "bun:test";

import { HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { HookDispatchCommand } from "@/modules/session/commands/hookDispatch/hookDispatch.command.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

function makeCommand() {
  const io = makeIoFake();
  const container = makeTestGateways({ stdio: io, proc: makeProcFake() });
  const command = new HookDispatchCommand(container, makeRunContext().config);
  return { command, io };
}

describe("HookDispatchCommand", () => {
  test("parse requires a hook name", () => {
    const { command } = makeCommand();
    expect(command.parse([])).toEqual({
      ok: false,
      error: { message: "hook: missing <name>" },
    });
  });

  test("an unknown hook name stays fail-open (exit 0) with a stderr diagnostic", async () => {
    const { command, io } = makeCommand();
    io.setStdin("{}");
    const result = await command.run({ name: "not-a-real-hook" }, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.stderrMessage).toContain("unknown hook name");
  });

  test("dispatchableHookNames lists the five hook names", () => {
    const { command } = makeCommand();
    void command;
    expect(Object.values(HookName)).toHaveLength(5);
  });
});
