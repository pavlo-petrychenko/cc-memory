import { expect, test } from "bun:test";

import { Command } from "@/core/entry/command.decorator.ts";
import type {
  ArgsError,
  Command as CommandContract,
  CommandDescriptor,
  CommandResult,
} from "@/core/entry/entry.typedefs.ts";
import { registerCommand } from "@/core/entry/entry.utils.ts";
import type { Result } from "@/core/index.ts";

const SPEC: CommandDescriptor = {
  path: ["ping"],
  usage: ["ping [--loud]"],
  summary: "pong",
  hidden: false,
};

type PingOptions = { readonly loud: boolean };

@Command(SPEC)
class PingCommand implements CommandContract<PingOptions> {
  parse(tokens: readonly string[]): Result<PingOptions, ArgsError> {
    return { ok: true, value: { loud: tokens.includes("--loud") } };
  }

  async run(options: PingOptions): Promise<CommandResult> {
    return {
      lines: [options.loud ? "PONG!" : "pong"],
      exitCode: 0,
      stderrMessage: null,
    };
  }
}

test("@Command attaches a spec readable through registerCommand", async () => {
  const registered = registerCommand(new PingCommand());
  expect(registered.spec).toBe(SPEC);

  const quiet = await registered.invoke([]);
  expect(quiet.lines).toEqual(["pong"]);
  expect(quiet.exitCode).toBe(0);

  const loud = await registered.invoke(["--loud"]);
  expect(loud.lines).toEqual(["PONG!"]);
});
