import { describe, expect, test } from "bun:test";

import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import { HookResultSerializer } from "@/core/transport/hook/hookResult.serializer.ts";

describe("HookResultSerializer.serialize", () => {
  const serializer = new HookResultSerializer();

  test("silent renders to null (nothing printed)", () => {
    expect(serializer.serialize({ kind: HookResultKind.Silent })).toBeNull();
  });

  test("context renders the hookSpecificOutput envelope", () => {
    const rendered = serializer.serialize({
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
    const rendered = serializer.serialize({ kind: HookResultKind.Block, reason: "stop" });
    expect(rendered).toBe(JSON.stringify({ decision: "block", reason: "stop" }));
  });
});
