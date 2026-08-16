import { expect, test } from "bun:test";

import { registerHooks } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { HookName, HookResultKind } from "@/core/index.ts";
import { SessionStartHookResolver } from "@/modules/memory/hooks/sessionStart/sessionStart.hook.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const WORKSPACE: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("registers the session-start hook and handles a payload", async () => {
  const [handler] = registerHooks([SessionStartHookResolver], makeAppContext());
  if (handler === undefined) throw new Error("expected one hook handler");

  expect(handler.name).toBe(HookName.SessionStart);
  const result = await handler.handle({}, WORKSPACE, absPath("/repo"));
  expect([HookResultKind.Silent, HookResultKind.Context, HookResultKind.Block]).toContain(
    result.kind,
  );
});
