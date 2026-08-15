import { expect, test } from "bun:test";

import type {
  ArgsError,
  Command as CommandContract,
  CommandDescriptor,
  CommandResult,
  RunContext,
} from "@/core/entry/entry.typedefs.ts";
import { registerCommand } from "@/core/entry/entry.utils.ts";
import { Command } from "@/core/index.ts";
import { LogLevel } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";

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

  async run(options: PingOptions, _context: RunContext): Promise<CommandResult> {
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

  const quiet = await registered.invoke([], CONTEXT);
  expect(quiet.lines).toEqual(["pong"]);
  expect(quiet.exitCode).toBe(0);

  const loud = await registered.invoke(["--loud"], CONTEXT);
  expect(loud.lines).toEqual(["PONG!"]);
});
