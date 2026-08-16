import { describe, expect, test } from "bun:test";

import { registerHooks } from "@/core/index.ts";
import { HOOK_DESCRIPTORS } from "@/core/index.ts";
import { HookName } from "@/core/index.ts";
import { hooks } from "@/registry.wiring.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

/**
 * The installer writes `<abs-bun> <dist> hook <name>` into
 * `~/.claude/settings.json`; the CLI dispatcher decides which `<name>` values it
 * accepts. If those two sets ever disagree, hooks do NOT report an error — they fail
 * open, which is the correct invariant but means the symptom is memory silently not
 * working in every session, with nothing in the output to explain why.
 *
 * Both sides import one shared enum; this test additionally pins that the hook
 * registry registers EVERY name the installer describes and no others, so dropping
 * a hook from either side fails here rather than in a user's session.
 */
describe("installer and dispatcher agree on hook names", () => {
  test("every registered hook name is dispatchable", () => {
    const registered = registerHooks(hooks, makeAppContext()).map((h) => h.name);
    for (const registration of HOOK_DESCRIPTORS) {
      expect(registered.map(String)).toContain(String(registration.name));
    }
  });

  test("every dispatchable hook name gets registered — none is left unwired", () => {
    const registered = registerHooks(hooks, makeAppContext()).map((h) => h.name);
    for (const name of Object.values(HookName)) {
      expect(registered).toContain(name);
    }
  });

  test("exactly the five hooks, registered once each", () => {
    const registered = registerHooks(hooks, makeAppContext()).map((h) => h.name);
    expect(registered).toHaveLength(5);
    expect(new Set(registered).size).toBe(5);
    expect(HOOK_DESCRIPTORS).toHaveLength(5);
  });
});
