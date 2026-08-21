import { describe, expect, it } from "vitest";
import { isSafeRelPath, assertInside } from "../utils/path.js";
import { relPathSchema } from "./common.schema.js";
import { graphQuerySchema } from "./graph.schema.js";

describe("isSafeRelPath", () => {
  it("allows safe paths", () => {
    expect(isSafeRelPath("auth/jwt.md")).toBe(true);
    expect(isSafeRelPath("a/b/c.md")).toBe(true);
  });

  it("rejects traversal via ..", () => {
    expect(isSafeRelPath("../etc/passwd")).toBe(false);
    expect(isSafeRelPath("a/b/../../c")).toBe(false);
    expect(isSafeRelPath("a/../b")).toBe(false);
  });

  it("rejects encoded %2e", () => {
    expect(isSafeRelPath("%2e%2e%2fsecret.md")).toBe(false);
    expect(isSafeRelPath("a/%2e/b")).toBe(false);
  });

  it("rejects double-encoded %252e", () => {
    expect(isSafeRelPath("%252e%252e/secret")).toBe(false);
  });

  it("rejects absolute and // and null byte", () => {
    expect(isSafeRelPath("/etc/passwd")).toBe(false);
    expect(isSafeRelPath("//a/b")).toBe(false);
    expect(isSafeRelPath("a\0b")).toBe(false);
    expect(isSafeRelPath("a\\b")).toBe(false);
  });
});

describe("assertInside", () => {
  it("allows inside", () => {
    expect(() => assertInside("/vault", "/vault/a/b.md")).not.toThrow();
    expect(() => assertInside("/vault", "/vault")).not.toThrow();
  });

  it("rejects prefix bypass", () => {
    expect(() => assertInside("/vault", "/vault-evil/a.md")).toThrow();
    expect(() => assertInside("/a/kb", "/a/kb2/evil")).toThrow();
  });

  it("rejects outside", () => {
    expect(() => assertInside("/vault", "/etc/passwd")).toThrow();
  });
});

describe("relPathSchema Zod", () => {
  it("parses valid", () => {
    expect(relPathSchema.parse("auth/jwt.md")).toBe("auth/jwt.md");
  });

  it("rejects traversal", () => {
    expect(() => relPathSchema.parse("../etc/passwd")).toThrow();
    expect(() => relPathSchema.parse("%2e%2e/secret")).toThrow();
  });
});

describe("graphQuerySchema", () => {
  it("defaults depth and full", () => {
    const q = graphQuerySchema.parse({ workspace: "seed" });
    expect(q.depth).toBe(1);
    expect(q.full).toBe(false);
  });

  it("parses depth 2 full 1", () => {
    const q = graphQuerySchema.parse({ depth: "2", full: "1" });
    expect(q.depth).toBe(2);
    expect(q.full).toBe(true);
  });

  it("rejects depth 3", () => {
    expect(() => graphQuerySchema.parse({ depth: 3 })).toThrow();
  });

  it("rejects depth NaN", () => {
    expect(() => graphQuerySchema.parse({ depth: "NaN" })).toThrow();
  });
});
