import { describe, expect, test } from "bun:test";

import { dispatchableHookNames } from "../session/hook.command.ts";
import { HookName } from "../session/HookName.ts";
import { hookRegistrations } from "./settings.service.ts";

/**
 * The installer writes `<abs-bun> <dist> hook <name>` into
 * `~/.claude/settings.json`; the CLI dispatcher decides which `<name>` values it
 * accepts. If those two sets ever disagree, hooks do NOT report an error — they fail
 * open, which is the correct invariant but means the symptom is memory silently not
 * working in every session, with nothing in the output to explain why.
 *
 * Both sides import one shared enum; this test additionally pins that the installer
 * registers EVERY dispatchable name and no others, so dropping a hook from either
 * side fails here rather than in a user's session.
 */
describe("installer and dispatcher agree on hook names", () => {
  test("every registered hook name is dispatchable", () => {
    for (const registration of hookRegistrations) {
      expect(dispatchableHookNames).toContain(registration.name);
    }
  });

  test("every dispatchable hook name gets registered — none is left unwired", () => {
    const registered = hookRegistrations.map((registration) => registration.name);
    for (const name of Object.values(HookName)) {
      expect(registered).toContain(name);
    }
  });

  test("exactly the five hooks, registered once each", () => {
    const registered = hookRegistrations.map((registration) => registration.name);
    expect(registered).toHaveLength(5);
    expect(new Set(registered).size).toBe(5);
    expect(dispatchableHookNames).toHaveLength(5);
  });
});
