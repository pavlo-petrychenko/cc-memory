import { describe, expect, test } from "bun:test";

import { HelpCommand } from "@/cli/help/help.command.ts";
import { HelpFormatter } from "@/cli/help/help.formatter.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";

describe("HelpCommand", () => {
  test("parse accepts no tokens", () => {
    expect(new HelpCommand(new HelpFormatter()).parse([])).toEqual({
      ok: true,
      value: {},
    });
  });

  test("run renders the command surface", async () => {
    const result = await new HelpCommand(new HelpFormatter()).run({}, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("memory workspace add");
    expect(result.lines.join("\n")).toContain("memory search");
  });
});
