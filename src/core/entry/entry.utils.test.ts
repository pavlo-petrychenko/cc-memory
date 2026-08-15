import { expect, test } from "bun:test";

import { Command } from "@/core/entry/command.decorator.ts";
import type {
  ArgsError,
  Command as CommandContract,
  CommandDescriptor,
  CommandResult,
  RunContext,
} from "@/core/entry/entry.typedefs.ts";
import {
  cliFailure,
  cliOutcome,
  flagValue,
  hasFlag,
  intFlag,
  registerCommand,
  requirePositional,
  variadicValues,
} from "@/core/entry/entry.utils.ts";
import { LogLevel } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";

test("cliFailure defaults to exit code 1 and cliOutcome is explicit", () => {
  expect(cliFailure("boom")).toEqual({ exitCode: 1, stderrMessage: "boom" });
  expect(cliFailure("boom", 3)).toEqual({ exitCode: 3, stderrMessage: "boom" });
  expect(cliOutcome(0, "note")).toEqual({ exitCode: 0, stderrMessage: "note" });
});

test("flag helpers match the CLI's token conventions", () => {
  const tokens = ["--workspace", "acme", "--cwd", "/tmp", "--worklog", "-k", "8"];

  expect(hasFlag(tokens, "--worklog")).toBe(true);
  expect(hasFlag(tokens, "--json")).toBe(false);
  expect(flagValue(tokens, "--workspace")).toBe("acme");
  expect(flagValue(tokens, "--missing")).toBeNull();
  expect(variadicValues(tokens, "--match")).toBeNull();
  expect(intFlag(tokens, "-k", 5)).toEqual({ ok: true, value: 8 });
  expect(intFlag(tokens, "-nope", 5)).toEqual({ ok: true, value: 5 });
  expect(intFlag(["-k", "x"], "-k", 5)).toEqual({
    ok: false,
    error: '-k: expected an integer, got "x"',
  });
});

test("requirePositional takes the first token or reports the missing name", () => {
  expect(requirePositional(["acme"], "id")).toEqual({ ok: true, value: "acme" });
  expect(requirePositional([], "id")).toEqual({
    ok: false,
    error: "missing <id>",
  });
});

const CONTEXT: RunContext = {
  home: absPath("/home"),
  cwd: absPath("/cwd"),
  config: {
    injectMinScore: 0.2,
    linkBoost: 0.003,
    injectLogEnabled: true,
    blockAfter: 2,
    blockDrift: 5,
    gateDisabled: false,
    logLevel: LogLevel.Warn,
  },
};

const SPEC: CommandDescriptor = {
  path: ["ping"],
  usage: ["ping"],
  summary: "pong",
  hidden: false,
};

type PingOptions = { readonly loud: boolean };

@Command(SPEC)
class PingCommand implements CommandContract<PingOptions> {
  parse(tokens: readonly string[]): Result<PingOptions, ArgsError> {
    return { ok: true, value: { loud: tokens.includes("--loud") } };
  }

  async run(options: PingOptions, _context: RunContext): Promise<CommandResult> {
    return {
      lines: [options.loud ? "PONG!" : "pong"],
      exitCode: 0,
      stderrMessage: null,
    };
  }
}

test("registerCommand wraps a command without a type assertion at the call site", async () => {
  const registered = registerCommand(new PingCommand());
  expect(registered.spec).toBe(SPEC);
  expect((await registered.invoke(["--loud"], CONTEXT)).lines).toEqual(["PONG!"]);
});
