import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/core.typedefs.ts";
import { PathErrorKind } from "@/core/utils/paths/paths.typedefs.ts";
import {
  absPath,
  expandPath,
  indexDbPath,
  injectLogPath,
  isUnder,
  joinAbs,
  logPath,
  manifestPath,
  parentDir,
  registryPath,
  relativeTo,
  relKey,
  tildify,
  tryAbsPath,
} from "@/core/utils/paths/paths.utils.ts";

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

describe("relativeTo", () => {
  const kb = expandPath("~/Documents/Vault", HOME);

  test("strips the base prefix, extension untouched", () => {
    expect(relativeTo(expandPath("~/Documents/Vault/Feature/Note.md", HOME), kb)).toBe(
      "Feature/Note.md",
    );
  });

  test("falls back to the full path when it isn't under base", () => {
    const outside = expandPath("/etc/hosts.md", HOME);
    expect(relativeTo(outside, kb)).toBe(outside);
  });

  test("leaves a path equal to base (no trailing slash to match) unchanged", () => {
    expect(relativeTo(kb, kb)).toBe(kb);
  });

  test("works on plain, non-branded strings too", () => {
    expect(relativeTo("/vault/notes/a.md", "/vault")).toBe("notes/a.md");
  });
});

describe("absPath / tryAbsPath", () => {
  const cases: readonly { readonly name: string; readonly input: string }[] = [
    { name: "the filesystem root", input: "/" },
    { name: "a plain absolute path", input: "/Users/tester/Documents" },
    { name: "an absolute path with a trailing segment", input: "/var/log/ccmem.log" },
  ];

  for (const { name, input } of cases) {
    test(`absPath accepts ${name}`, () => {
      expect(String(absPath(input))).toBe(input);
    });

    test(`tryAbsPath accepts ${name}`, () => {
      const result = tryAbsPath(input);
      expect(result).toEqual({ ok: true, value: absPath(input) });
    });
  }

  const rejected: readonly string[] = ["relative/path", "~/Documents", "", "./here"];

  for (const input of rejected) {
    test(`absPath throws for ${JSON.stringify(input)}`, () => {
      expect(() => absPath(input)).toThrow();
    });

    test(`tryAbsPath reports an error for ${JSON.stringify(input)}`, () => {
      expect(tryAbsPath(input)).toEqual({
        ok: false,
        error: { kind: PathErrorKind.NotAbsolute, value: input },
      });
    });
  }
});

describe("joinAbs", () => {
  test("joins a single segment onto a normal base", () => {
    expect(String(joinAbs(HOME, "sub"))).toBe(`${HOME}/sub`);
  });

  test("joins multiple segments in order", () => {
    expect(String(joinAbs(HOME, "a", "b", "c"))).toBe(`${HOME}/a/b/c`);
  });

  test("returns base unchanged when given no segments", () => {
    expect(String(joinAbs(HOME))).toBe(HOME);
  });

  test("does not double the slash when base is the filesystem root", () => {
    // SAFETY: a fixed test fixture — the filesystem root is always absolute.
    const root = absPath("/");
    expect(String(joinAbs(root, "wrap-state.json"))).toBe("/wrap-state.json");
  });
});

describe("parentDir", () => {
  test("strips the last segment of a nested path", () => {
    expect(String(parentDir(expandPath("~/Documents/Vault/Note.md", HOME)))).toBe(
      `${HOME}/Documents/Vault`,
    );
  });

  test("a single-segment absolute path's parent is the root", () => {
    // SAFETY: a fixed test fixture.
    expect(String(parentDir(absPath("/index.db")))).toBe("/");
  });

  test("the root's parent is itself the root", () => {
    // SAFETY: a fixed test fixture.
    expect(String(parentDir(absPath("/")))).toBe("/");
  });
});

describe("home-rooted path builders", () => {
  test("registryPath", () => {
    expect(String(registryPath(HOME))).toBe(`${HOME}/.claude/memory/registry.toml`);
  });

  test("indexDbPath", () => {
    expect(String(indexDbPath(HOME, "acme"))).toBe(
      `${HOME}/.claude/memory/acme/index.db`,
    );
  });

  test("manifestPath", () => {
    expect(String(manifestPath(HOME))).toBe(`${HOME}/.claude/memory/installed.json`);
  });

  test("logPath", () => {
    expect(String(logPath(HOME))).toBe(`${HOME}/.claude/memory/ccmem.log`);
  });

  test("injectLogPath", () => {
    expect(String(injectLogPath(HOME, "acme"))).toBe(
      `${HOME}/.claude/memory/acme/inject.jsonl`,
    );
  });
});
