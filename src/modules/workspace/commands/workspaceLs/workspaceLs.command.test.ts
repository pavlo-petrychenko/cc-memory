import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { WorkspaceLsCommand } from "@/modules/workspace/index.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const [handler] = registerCommands([WorkspaceLsCommand], makeAppContext());
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("WorkspaceLsCommand", () => {
  test("run reports no workspaces for an empty registry", async () => {
    const result = await makeHandler().invoke([]);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["(no workspaces)"]);
  });
});
