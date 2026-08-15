import { describe, expect, test } from "bun:test";

import type { RawWorkspace } from "@/core/index.ts";
import { WorkspaceParser } from "@/modules/workspace/workspace.parser.ts";
import { WorkspaceSerializer } from "@/modules/workspace/workspace.serializer.ts";

const serializer = new WorkspaceSerializer();
const parser = new WorkspaceParser();

const acme: RawWorkspace = {
  id: "acme",
  match: ["~/code/acme"],
  kb: "~/Documents/Acme Vault",
  worklogs: "~/Documents/Acme Vault/_Worklogs",
  exclude: ["_Worklogs", "Archive", ".obsidian"],
  indexDb: "~/.claude/memory/acme/index.db",
};

describe("WorkspaceSerializer.serialize", () => {
  test("an empty list serializes to just the header", () => {
    expect(serializer.serialize([])).toContain("# cc-memory workspace registry");
    expect(serializer.serialize([])).not.toContain("[[workspace]]");
  });

  test("round-trips through the parser byte-identically", () => {
    const text = serializer.serialize([acme]);
    const parsed = parser.parse(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializer.serialize(parsed.value)).toBe(text);
  });
});
