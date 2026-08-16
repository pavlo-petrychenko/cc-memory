import { expect, test } from "bun:test";

import { Command, registerCommands } from "@/core/index.ts";
import type { AppContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { UseCase } from "@/core/index.ts";
import type { ArgsError, CommandResult } from "@/core/transport/cli/cli.typedefs.ts";
import {
  cliFailure,
  cliOutcome,
  flagValue,
  hasFlag,
  intFlag,
  requirePositional,
  variadicValues,
} from "@/core/transport/cli/cli.utils.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

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

type PingOptions = { readonly loud: boolean };

class PingUseCase extends UseCase<PingOptions, Result<readonly string[], string>> {
  async execute(options: PingOptions): Promise<Result<readonly string[], string>> {
    return { ok: true, value: [options.loud ? "PONG!" : "pong"] };
  }
}

@Command({
  path: ["ping"],
  usage: ["ping"],
  summary: "pong",
  hidden: false,
  Handler: PingUseCase,
  mapOptions: (tokens): Result<PingOptions, ArgsError> => ({
    ok: true,
    value: { loud: tokens.includes("--loud") },
  }),
})
class PingCommand {}

test("registerCommands wraps a command class into a handler without a type assertion", async () => {
  const ctx: AppContext = makeAppContext();
  const [registered] = registerCommands([PingCommand], ctx);
  if (registered === undefined) throw new Error("expected one command handler");

  expect(registered.path).toEqual(["ping"]);
  const result: CommandResult = await registered.invoke(["--loud"]);
  expect(result.lines).toEqual(["PONG!"]);
});
