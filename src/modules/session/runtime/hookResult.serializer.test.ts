import { describe, expect, test } from "bun:test";

import { HookResultSerializer } from "@/modules/session/runtime/hookResult.serializer.ts";
import { HookEvent, HookResultKind } from "@/modules/session/session.typedefs.ts";

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
