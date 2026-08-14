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

  // A semantic round-trip is NOT enough for C1: this file is user-owned and every
  // `memory workspace add|rm` rewrites it, so the BYTES have to match what
  // registry.py:68-85 produced or the user gets spurious churn in their registry.
  // This golden is the exact output of `registry.dumps()` for the same input —
  // it is what caught smol-toml's `[ "a", "b" ]` inner-space array formatting.
  test("emits bytes identical to registry.dumps() (no spaces inside arrays)", () => {
    const output = serializeRegistry([
      {
        id: "mate",
        match: ["~/Desktop/project"],
        kb: "~/Documents/Mate Vault",
        worklogs: "~/Documents/Mate Vault/_Worklogs",
        exclude: ["_Worklogs", "Archive", ".obsidian"],
        indexDb: "~/.claude/memory/mate/index.db",
      },
    ]);

    expect(output).toBe(
      "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
        "# Paths may use ~; they are expanded at load time. One block per workspace.\n" +
        "\n" +
        "[[workspace]]\n" +
        'id = "mate"\n' +
        'match = ["~/Desktop/project"]\n' +
        'kb = "~/Documents/Mate Vault"\n' +
        'worklogs = "~/Documents/Mate Vault/_Worklogs"\n' +
        'exclude = ["_Worklogs", "Archive", ".obsidian"]\n' +
        'index_db = "~/.claude/memory/mate/index.db"\n',
    );
  });

  // registry.py:60-61 escapes backslashes then double quotes, and nothing else.
  test("quoting escapes backslashes and double quotes exactly as _q does", () => {
    const output = serializeRegistry([
      {
        id: 'we"ird\\path',
        match: [],
        kb: "~/K",
        worklogs: "~/K/_Worklogs",
        exclude: [],
        indexDb: "~/.claude/memory/x/index.db",
      },
    ]);
    expect(output).toContain('id = "we\\"ird\\\\path"');
    expect(output).toContain("match = []");
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
