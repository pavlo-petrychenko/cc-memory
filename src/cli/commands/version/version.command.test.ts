import { expect, test } from "bun:test";

import { VersionCommand } from "@/cli/commands/version/version.command.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";

test("VersionCommand prints the installed version", async () => {
  const result = await new VersionCommand().run({}, makeRunContext());
  expect(result.exitCode).toBe(0);
  expect(result.lines).toEqual(["memory 0.1.0"]);
});
