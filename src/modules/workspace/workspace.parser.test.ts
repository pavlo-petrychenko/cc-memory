import { describe, expect, test } from "bun:test";

import { WorkspaceParser } from "@/modules/workspace/workspace.parser.ts";
import { RegistryErrorKind } from "@/modules/workspace/workspace.typedefs.ts";

const parser = new WorkspaceParser();

describe("WorkspaceParser.parse", () => {
  test("parses a well-formed registry into raw workspaces", () => {
    const result = parser.parse(
      '[[workspace]]\nid = "acme"\nmatch = ["~/code/acme"]\nkb = "~/Documents/Acme Vault"\nworklogs = "~/Documents/Acme Vault/_Worklogs"\nexclude = ["_Worklogs"]\nindex_db = "~/.claude/memory/acme/index.db"\n',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.id).toBe("acme");
    expect(result.value[0]?.exclude).toEqual(["_Worklogs"]);
  });

  test("an absent [[workspace]] key is an empty list, not malformed", () => {
    expect(parser.parse("# nothing here\n")).toEqual({ ok: true, value: [] });
  });

  test("invalid TOML syntax is a typed ParseError", () => {
    const result = parser.parse("[[workspace\nid = \n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe(RegistryErrorKind.ParseError);
  });

  test("a workspace entry missing a required key is a typed Malformed error", () => {
    const result = parser.parse(
      '[[workspace]]\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\n',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe(RegistryErrorKind.Malformed);
    expect(result.error.message).toContain("id");
  });
});
