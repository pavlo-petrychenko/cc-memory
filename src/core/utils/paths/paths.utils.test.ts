import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/core.typedefs.ts";
import { expandPath, isUnder, relKey, tildify } from "@/core/utils/paths/paths.utils.ts";

// SAFETY: test fixture only — a fixed home path, never a real filesystem
// lookup. This is the pattern every real caller uses too: `expandPath`'s own
// safety comment is the one place the cast actually matters.
const HOME = "/Users/tester" as AbsPath;

describe("expandPath / tildify round-trip", () => {
  test("expands a bare ~ to home", () => {
    expect(expandPath("~", HOME)).toBe(HOME);
  });

  test("expands ~/sub to home/sub, normalized", () => {
    expect(String(expandPath("~/Documents/Vault", HOME))).toBe(`${HOME}/Documents/Vault`);
  });

  test("leaves an absolute path alone (normalized)", () => {
    expect(String(expandPath("/var/tmp/../log", HOME))).toBe("/var/log");
  });

  test("a path merely containing ~ elsewhere is not expanded", () => {
    expect(String(expandPath("/a/~b", HOME))).toBe("/a/~b");
  });

  test("a relative path with a leading .. keeps it (no root to climb above)", () => {
    expect(String(expandPath("../sibling", HOME))).toBe("../sibling");
  });

  test("tildify collapses the home directory back to ~", () => {
    expect(tildify(expandPath("~/Documents/Vault", HOME), HOME)).toBe(
      "~/Documents/Vault",
    );
  });

  test("tildify on the exact home path returns bare ~", () => {
    expect(tildify(HOME, HOME)).toBe("~");
  });

  test("tildify leaves an unrelated absolute path alone", () => {
    const other = expandPath("/etc/hosts", HOME);
    expect(tildify(other, HOME)).toBe("/etc/hosts");
  });

  test("a sibling directory that merely shares the home prefix is not tildified", () => {
    // e.g. home "/Users/tester" vs "/Users/tester2" — must not collapse to "~2".
    const sibling = expandPath("/Users/tester2/file", HOME);
    expect(tildify(sibling, HOME)).toBe("/Users/tester2/file");
  });
});

describe("isUnder", () => {
  const kb = expandPath("~/Documents/Vault", HOME);

  test("a path equal to parent is under it", () => {
    expect(isUnder(kb, kb)).toBe(true);
  });

  test("a nested path is under it", () => {
    expect(isUnder(expandPath("~/Documents/Vault/Feature", HOME), kb)).toBe(true);
  });

  test("a sibling with a shared prefix is NOT under it", () => {
    const sibling = expandPath("~/Documents/Vault2", HOME);
    expect(isUnder(sibling, kb)).toBe(false);
  });

  test("an unrelated path is not under it", () => {
    expect(isUnder(expandPath("/etc/hosts", HOME), kb)).toBe(false);
  });
});

describe("relKey", () => {
  const kb = expandPath("~/Documents/Vault", HOME);

  test("strips the base prefix and the .md extension", () => {
    expect(relKey(expandPath("~/Documents/Vault/Feature/Note.md", HOME), kb)).toBe(
      "Feature/Note",
    );
  });

  test("leaves a non-.md path's extension alone", () => {
    expect(relKey(expandPath("~/Documents/Vault/asset.png", HOME), kb)).toBe("asset.png");
  });

  test("falls back to the full path when it isn't under base", () => {
    const outside = expandPath("/etc/hosts.md", HOME);
    expect(relKey(outside, kb)).toBe(outside.slice(0, -3));
  });
});
