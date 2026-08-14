import { describe, expect, test } from "bun:test";

import { CLI_SUCCESS, cliFailure, cliOutcome } from "../../src/cli/CliOutcome.ts";

describe("CliOutcome", () => {
  test("CLI_SUCCESS is exit 0 with no stderr message", () => {
    expect(CLI_SUCCESS).toEqual({ exitCode: 0, stderrMessage: null });
  });

  test("cliFailure defaults to exit 1 (sys.exit('msg')'s default)", () => {
    expect(cliFailure("no such workspace: x")).toEqual({
      exitCode: 1,
      stderrMessage: "no such workspace: x",
    });
  });

  test("cliFailure accepts an explicit exit code", () => {
    expect(cliFailure("bad args", 2)).toEqual({ exitCode: 2, stderrMessage: "bad args" });
  });

  test("cliOutcome allows exit 0 with a stderr message (the hook stub's fail-open shape)", () => {
    expect(cliOutcome(0, "not implemented")).toEqual({
      exitCode: 0,
      stderrMessage: "not implemented",
    });
  });
});
