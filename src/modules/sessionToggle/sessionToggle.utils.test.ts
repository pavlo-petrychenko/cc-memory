import { describe, expect, test } from "bun:test";

import {
  isSafeSessionId,
  markerFileName,
} from "@/modules/sessionToggle/sessionToggle.utils.ts";

describe("markerFileName", () => {
  test("suffixes the session id with .off", () => {
    expect(markerFileName("abc-123")).toBe("abc-123.off");
  });
});

describe("isSafeSessionId", () => {
  test("accepts uuids and simple ids", () => {
    expect(isSafeSessionId("9e031b73-2bfa-4d04-b1dd-46d56eaa2b13")).toBe(true);
    expect(isSafeSessionId("session_1.2")).toBe(true);
  });

  test("rejects path traversal, separators, whitespace, and empty values", () => {
    expect(isSafeSessionId("../escape")).toBe(false);
    expect(isSafeSessionId("a/b")).toBe(false);
    expect(isSafeSessionId("a b")).toBe(false);
    expect(isSafeSessionId("")).toBe(false);
    expect(isSafeSessionId(".")).toBe(false);
    expect(isSafeSessionId("..")).toBe(false);
  });

  test("rejects unreasonably long ids", () => {
    expect(isSafeSessionId("a".repeat(129))).toBe(false);
    expect(isSafeSessionId("a".repeat(128))).toBe(true);
  });
});
