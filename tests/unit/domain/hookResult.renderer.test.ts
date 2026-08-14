import { describe, expect, test } from "bun:test";

import { renderHookResult } from "../../../src/domain/hookResult.renderer.ts";
import { HookEvent, HookResultKind } from "../../../src/domain/HookResult.ts";

describe("renderHookResult (C2)", () => {
  test("silent renders to null (nothing printed)", () => {
    expect(renderHookResult({ kind: HookResultKind.Silent })).toBeNull();
  });

  test("context renders the hookSpecificOutput envelope", () => {
    const rendered = renderHookResult({
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
    const rendered = renderHookResult({ kind: HookResultKind.Block, reason: "stop" });
    expect(rendered).toBe(JSON.stringify({ decision: "block", reason: "stop" }));
  });
});
