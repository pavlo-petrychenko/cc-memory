import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { WorkspaceRmCommand } from "@/modules/workspace/index.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const [handler] = registerCommands([WorkspaceRmCommand], makeAppContext());
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("WorkspaceRmCommand", () => {
  test("parse requires an id", async () => {
    expect(await makeHandler().invoke([])).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "workspace rm: missing <id>",
    });
  });

  test("run reports an unknown workspace", async () => {
    const result = await makeHandler().invoke(["ghost"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderrMessage).toBe("no such workspace: ghost");
  });
});
