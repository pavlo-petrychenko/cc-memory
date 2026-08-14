import { describe, expect, test } from "bun:test";

import { parse } from "smol-toml";

import { serializeRegistry } from "../../../../src/domain/render/registryToml.renderer.ts";

describe("serializeRegistry (C1)", () => {
  test("an empty registry is just the header comment", () => {
    expect(serializeRegistry([])).toBe(
      "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
        "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n",
    );
  });

  test("keeps the header and field order, round-trips through smol-toml", () => {
    const output = serializeRegistry([
      {
        id: "personal",
        match: ["~/Documents/personal/cc-memory"],
        kb: "~/Documents/Personal Vault",
        worklogs: "~/Documents/Personal Vault/_Worklogs",
        exclude: ["_Worklogs", "Archive", ".obsidian"],
        indexDb: "~/.claude/memory/personal/index.db",
      },
    ]);

    expect(output.startsWith("# cc-memory workspace registry")).toBe(true);

    // Field order matches registry.py:71-85 exactly.
    const block = output.slice(output.indexOf("[[workspace]]"));
    const fieldNames = [...block.matchAll(/^(\w+) = /gm)].map((match) => match[1]);
    expect(fieldNames).toEqual(["id", "match", "kb", "worklogs", "exclude", "index_db"]);

    expect(parse(output)).toEqual({
      workspace: [
        {
          id: "personal",
          match: ["~/Documents/personal/cc-memory"],
          kb: "~/Documents/Personal Vault",
          worklogs: "~/Documents/Personal Vault/_Worklogs",
          exclude: ["_Worklogs", "Archive", ".obsidian"],
          index_db: "~/.claude/memory/personal/index.db",
        },
      ],
    });
  });

  test("multiple workspaces produce multiple [[workspace]] blocks, blank-line separated", () => {
    const output = serializeRegistry([
      {
        id: "a",
        match: ["/x"],
        kb: "~/A",
        worklogs: "~/A/_Worklogs",
        exclude: [],
        indexDb: "~/.claude/memory/a/index.db",
      },
      {
        id: "b",
        match: ["/y"],
        kb: "~/B",
        worklogs: "~/B/_Worklogs",
        exclude: [],
        indexDb: "~/.claude/memory/b/index.db",
      },
    ]);
    expect(output.match(/\[\[workspace\]\]/g)).toHaveLength(2);
    expect(output).toContain("\n\n[[workspace]]");
  });
});
