import { expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { VersionCommand } from "@/modules/meta/index.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

function makeHandler() {
  const [handler] = registerCommands([VersionCommand], makeAppContext());
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

test("VersionCommand prints the installed version", async () => {
  const result = await makeHandler().invoke([]);
  expect(result.exitCode).toBe(0);
  expect(result.lines).toEqual(["memory 0.1.0"]);
});
