import { expect, test } from "bun:test";

import type { HookDescriptor } from "@/core/entry/entry.typedefs.ts";
import { Hook } from "@/core/entry/hook.decorator.ts";

const DESCRIPTOR: HookDescriptor = {
  name: "session-start",
  event: "SessionStart",
  timeoutSeconds: 10,
};

@Hook(DESCRIPTOR)
class SessionStartHook {}

test("@Hook attaches the descriptor to the class as its static spec", () => {
  // SAFETY: @Hook defines `spec` on the class at decoration time; the assertion
  // only re-reads the property the decorator is known to have written.
  const constructor = SessionStartHook as { readonly spec?: HookDescriptor };
  expect(constructor.spec).toBe(DESCRIPTOR);
});
