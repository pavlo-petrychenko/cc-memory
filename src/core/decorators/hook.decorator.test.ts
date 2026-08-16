import { describe, expect, test } from "bun:test";

import type { AppContext } from "@/core/base/context.typedefs.ts";
import { UseCase } from "@/core/base/useCase.base.ts";
import type { Config } from "@/core/config/config.typedefs.ts";
import { LogLevel } from "@/core/config/config.typedefs.ts";
import {
  HookEvent,
  HookName,
  HookResultKind,
} from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";

import { Hook, type HookHandler, registerHooks } from "./hook.decorator.ts";

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

type StartOptions = Record<string, never>;

class StartUseCase extends UseCase<StartOptions, HookResult> {
  async execute(_options: StartOptions): Promise<HookResult> {
    return { kind: HookResultKind.Silent };
  }
}

@Hook({
  name: HookName.SessionStart,
  event: HookEvent.SessionStart,
  timeoutSeconds: 10,
  Handler: StartUseCase,
  mapOptions: () => ({}),
})
class SessionStartHook {}

function singleHandler(): HookHandler {
  const [handler] = registerHooks([SessionStartHook], CTX);
  if (handler === undefined) throw new Error("expected one hook handler");
  return handler;
}

describe("@Hook + registerHooks", () => {
  test("exposes the hook name on the handler", () => {
    expect(singleHandler().name).toBe(HookName.SessionStart);
  });

  test("handle runs the use case and returns its HookResult", async () => {
    const result = await singleHandler().handle({});
    expect(result).toEqual({ kind: HookResultKind.Silent });
  });
});
