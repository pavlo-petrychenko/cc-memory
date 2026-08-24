import { describe, expect, test } from "bun:test";

import { ToggleFormatter } from "@/modules/sessionToggle/commands/toggle.formatter.ts";

const SESSION = "fc61f191-df21-457b-98ca-a1e8158486c5";

describe("ToggleFormatter", () => {
  const formatter = new ToggleFormatter();

  test("state lines name the session", () => {
    expect(formatter.onLine(SESSION)).toBe(`cc-memory on for session ${SESSION}`);
    expect(formatter.offLine(SESSION)).toBe(`cc-memory off for session ${SESSION}`);
  });

  test("status lines distinguish on from off", () => {
    expect(formatter.statusLine(SESSION, true)).toBe(
      `cc-memory is on for session ${SESSION}`,
    );
    expect(formatter.statusLine(SESSION, false)).toBe(
      `cc-memory is off for session ${SESSION}`,
    );
  });

  test("error messages name both remedies for a missing id", () => {
    expect(formatter.missingSessionId()).toContain("--session");
    expect(formatter.missingSessionId()).toContain("CLAUDE_CODE_SESSION_ID");
  });

  test("the unsafe-id message echoes the rejected value and the allowed set", () => {
    expect(formatter.unsafeSessionId("../x")).toContain("../x");
    expect(formatter.unsafeSessionId("../x")).toContain("unsafe session id");
  });
});
