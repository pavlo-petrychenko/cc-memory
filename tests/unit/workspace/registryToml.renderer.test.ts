import { describe, expect, test } from "bun:test";

import { parse } from "smol-toml";

import { serializeRegistry } from "../../../src/workspace/registryToml.renderer.ts";

describe("serializeRegistry", () => {
  test("an empty registry is just the header comment", () => {
    expect(serializeRegistry([])).toBe(
      "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
        "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n",
    );
  });

  // This file is user-owned and rewritten by every `memory workspace add|rm`, so its
  // formatting must stay byte-stable or the user gets spurious diffs in their
  // registry. This golden asserts arrays are emitted without inner spaces
  // (smol-toml's default `[ "a", "b" ]` would produce a diff on every write).
  test("emits stable bytes (no spaces inside arrays)", () => {
    const output = serializeRegistry([
      {
        id: "acme",
        match: ["~/code/acme"],
        kb: "~/Documents/Acme Vault",
        worklogs: "~/Documents/Acme Vault/_Worklogs",
        exclude: ["_Worklogs", "Archive", ".obsidian"],
        indexDb: "~/.claude/memory/acme/index.db",
      },
    ]);

    expect(output).toBe(
      "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
        "# Paths may use ~; they are expanded at load time. One block per workspace.\n" +
        "\n" +
        "[[workspace]]\n" +
        'id = "acme"\n' +
        'match = ["~/code/acme"]\n' +
        'kb = "~/Documents/Acme Vault"\n' +
        'worklogs = "~/Documents/Acme Vault/_Worklogs"\n' +
        'exclude = ["_Worklogs", "Archive", ".obsidian"]\n' +
        'index_db = "~/.claude/memory/acme/index.db"\n',
    );
  });

  // Quoting escapes backslashes then double quotes, and nothing else.
  test("quoting escapes backslashes and double quotes", () => {
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
        id: "homeserver",
        match: ["~/code/acme/service-api"],
        kb: "~/Documents/Homeserver Vault",
        worklogs: "~/Documents/Homeserver Vault/_Worklogs",
        exclude: ["_Worklogs", "Archive", ".obsidian"],
        indexDb: "~/.claude/memory/homeserver/index.db",
      },
    ]);

    expect(output.startsWith("# cc-memory workspace registry")).toBe(true);

    const block = output.slice(output.indexOf("[[workspace]]"));
    const fieldNames = [...block.matchAll(/^(\w+) = /gm)].map((match) => match[1]);
    expect(fieldNames).toEqual(["id", "match", "kb", "worklogs", "exclude", "index_db"]);

    expect(parse(output)).toEqual({
      workspace: [
        {
          id: "homeserver",
          match: ["~/code/acme/service-api"],
          kb: "~/Documents/Homeserver Vault",
          worklogs: "~/Documents/Homeserver Vault/_Worklogs",
          exclude: ["_Worklogs", "Archive", ".obsidian"],
          index_db: "~/.claude/memory/homeserver/index.db",
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
