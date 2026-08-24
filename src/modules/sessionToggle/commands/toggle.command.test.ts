import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import { registerCommands } from "@/core/index.ts";
import { ToggleCommand } from "@/modules/sessionToggle/commands/toggle.command.ts";
import { makeEnvFake } from "@/testing/fakes/envMap.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const HOME = absPath("/home/test");
const SESSION = "9e031b73-2bfa-4d04-b1dd-46d56eaa2b13";

function makeHandler() {
  const env = makeEnvFake(
    HOME,
    absPath("/home/test/project"),
    absPath("/home/test/repo"),
  );
  env.set("CLAUDE_CODE_SESSION_ID", SESSION);
  const handler = registerCommands([ToggleCommand], makeAppContext({ env }))[0];
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("ToggleCommand argument mapping", () => {
  test("a bare invocation maps to flip", async () => {
    const result = await makeHandler().invoke([]);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual([`cc-memory off for session ${SESSION}`]);
  });

  test("on/off/status map through; --session values are not read as actions", async () => {
    const handler = makeHandler();
    const on = await handler.invoke(["--session", SESSION, "on"]);
    expect(on.exitCode).toBe(0);
    expect(on.lines[0]).toContain("for session");
    const off = await handler.invoke(["off"]);
    expect(off.exitCode).toBe(0);
    expect(off.lines[0]).toContain("for session");
    const status = await handler.invoke(["status"]);
    expect(status.exitCode).toBe(0);
    expect(status.lines[0]).toContain("is");
  });

  test("two action words fail args parsing", async () => {
    const result = await makeHandler().invoke(["on", "off"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderrMessage ?? "").toContain("at most one action");
  });

  test("an unknown action word names the allowed set", async () => {
    const result = await makeHandler().invoke(["banana"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderrMessage ?? "").toContain("unknown action 'banana'");
  });
});
