import { describe, expect, test } from "bun:test";

import { serializeHookResult } from "@/session/runtime/hookResult.serializer.ts";
import { HookEvent, HookResultKind } from "@/session/session.typedefs.ts";

describe("serializeHookResult", () => {
  test("silent renders to null (nothing printed)", () => {
    expect(serializeHookResult({ kind: HookResultKind.Silent })).toBeNull();
  });

  test("context renders the hookSpecificOutput envelope", () => {
    const rendered = serializeHookResult({
      kind: HookResultKind.Context,
      event: HookEvent.SessionStart,
      text: "hello",
    });
    expect(rendered).toBe(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hello" },
      }),
    );
  });

  test("block renders the decision/reason envelope", () => {
    const rendered = serializeHookResult({ kind: HookResultKind.Block, reason: "stop" });
    expect(rendered).toBe(JSON.stringify({ decision: "block", reason: "stop" }));
  });
});
