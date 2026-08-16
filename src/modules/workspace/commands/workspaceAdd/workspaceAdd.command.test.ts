import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { WorkspaceAddCommand } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const ctx = makeAppContext({ fs: makeFsMemoryFake() });
  const [handler] = registerCommands([WorkspaceAddCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("WorkspaceAddCommand", () => {
  test("parse requires an id and --match", async () => {
    const { handler } = makeHandler();
    expect(await handler.invoke([])).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "workspace add: missing <id>",
    });
    expect(await handler.invoke(["acme"])).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "workspace add: --match requires at least one path",
    });
  });

  test("run registers the workspace and prints the added lines", async () => {
    const { handler } = makeHandler();
    const result = await handler.invoke(["acme", "--match", "/repo"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("✓ workspace 'acme' added");
  });
});
