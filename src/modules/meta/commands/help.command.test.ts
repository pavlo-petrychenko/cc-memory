import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { HelpCommand } from "@/modules/meta/index.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const [handler] = registerCommands([HelpCommand], makeAppContext());
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("HelpCommand", () => {
  test("run renders the command surface", async () => {
    const result = await makeHandler().invoke([]);
    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("memory workspace add");
    expect(result.lines.join("\n")).toContain("memory search");
  });
});
