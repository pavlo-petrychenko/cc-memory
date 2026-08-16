import { describe, expect, test } from "bun:test";

import type { AppContext } from "@/core/base/context.typedefs.ts";
import { UseCase } from "@/core/base/useCase.base.ts";
import type { Config } from "@/core/config/config.typedefs.ts";
import { LogLevel } from "@/core/config/config.typedefs.ts";
import type { Result } from "@/core/core.typedefs.ts";

import { Command, type CommandHandler, registerCommands } from "./command.decorator.ts";

const CONFIG: Config = {
  injectMinScore: 0.2,
  linkBoost: 0.003,
  injectLogEnabled: true,
  blockAfter: 2,
  blockDrift: 5,
  gateDisabled: false,
  logLevel: LogLevel.Warn,
};

// SAFETY: the decorator under test only stores the ctx and passes it through to
// the use case constructor; it never dereferences a gateway member.
const CTX: AppContext = {
  gateways: {} as AppContext["gateways"],
  searchIndex: {} as AppContext["searchIndex"],
  config: CONFIG,
};

class GreetUseCase extends UseCase<{ name: string }, Result<readonly string[], string>> {
  async execute(options: { name: string }): Promise<Result<readonly string[], string>> {
    return { ok: true, value: [`hello ${options.name}`] };
  }
}

@Command({
  path: ["greet"],
  usage: ["greet <name>"],
  summary: "greet someone",
  hidden: false,
  Handler: GreetUseCase,
  mapOptions: (tokens) => {
    const name = tokens[0];
    if (name === undefined) {
      return { ok: false, error: { message: "missing <name>" } };
    }
    return { ok: true, value: { name } };
  },
})
class GreetCommand {}

function singleHandler(): CommandHandler {
  const [handler] = registerCommands([GreetCommand], CTX);
  if (handler === undefined) throw new Error("expected one command handler");
  return handler;
}

describe("@Command + registerCommands", () => {
  test("exposes the descriptor metadata on the handler", () => {
    const handler = singleHandler();
    expect(handler.path).toEqual(["greet"]);
    expect(handler.usage).toEqual(["greet <name>"]);
    expect(handler.summary).toBe("greet someone");
    expect(handler.hidden).toBe(false);
  });

  test("an argument-parse failure maps to exit 2 with the message", async () => {
    const result = await singleHandler().invoke([]);
    expect(result).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "missing <name>",
    });
  });

  test("success runs the use case and returns its lines", async () => {
    const result = await singleHandler().invoke(["world"]);
    expect(result).toEqual({
      lines: ["hello world"],
      exitCode: 0,
      stderrMessage: null,
    });
  });
});
