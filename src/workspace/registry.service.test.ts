import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { RawWorkspace } from "../core/Workspace.ts";
import { makeFsMemoryFake } from "../testing/fakes/fsMemory.fake.ts";
import {
  defaultRegistryPath,
  expandWorkspace,
  findWorkspace,
  loadRegistry,
  RegistryConflictKind,
  RegistryErrorKind,
  saveRegistry,
  validateNew,
} from "./registry.service.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — same pattern as
// `tests/unit/domain/paths.test.ts`'s `HOME`.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const acme: RawWorkspace = {
  id: "acme",
  match: ["~/code/acme"],
  kb: "~/Documents/Acme Vault",
  worklogs: "~/Documents/Acme Vault/_Worklogs",
  exclude: ["_Worklogs", "Archive", ".obsidian"],
  indexDb: "~/.claude/memory/acme/index.db",
};

const homeserver: RawWorkspace = {
  id: "homeserver",
  match: ["~/homeserver"],
  kb: "~/Documents/Homeserver Vault",
  worklogs: "~/Documents/Homeserver Vault/_Worklogs",
  exclude: ["_Worklogs", "Archive", ".obsidian"],
  indexDb: "~/.claude/memory/homeserver/index.db",
};

describe("defaultRegistryPath", () => {
  test("expands the ~-relative default path against home", () => {
    expect(defaultRegistryPath(HOME)).toBe(
      expandPath("~/.claude/memory/registry.toml", HOME),
    );
  });
});

describe("loadRegistry", () => {
  test("a missing registry file is an empty list, not an error", async () => {
    const fs = makeFsMemoryFake();
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result).toEqual({ ok: true, value: [] });
  });

  test("a directory at the registry path is treated as missing", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(REGISTRY_PATH);
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result).toEqual({ ok: true, value: [] });
  });

  test("parses a well-formed registry into raw workspaces", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = ["~/code/acme"]\nkb = "~/Documents/Acme Vault"\nworklogs = "~/Documents/Acme Vault/_Worklogs"\nexclude = ["_Worklogs"]\nindex_db = "~/.claude/memory/acme/index.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result).toEqual({ ok: true, value: [{ ...acme, exclude: ["_Worklogs"] }] });
  });

  test("a workspace table with no exclude defaults it to []", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = ["~/code/acme"]\nkb = "~/Documents/Acme Vault"\nworklogs = "~/Documents/Acme Vault/_Worklogs"\nindex_db = "~/.claude/memory/acme/index.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]?.exclude).toEqual([]);
  });

  test("an absent [[workspace]] key is an empty list, not malformed", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, "# nothing here\n");
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result).toEqual({ ok: true, value: [] });
  });

  test("invalid TOML syntax is a typed ParseError", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, "[[workspace\nid = \n");
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.ParseError);
  });

  test("workspace as a non-array value is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, 'workspace = "oops"\n');
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
  });

  test("a workspace entry missing a required key is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
    expect(!result.ok && result.error.message).toContain("id");
  });

  test("a wrong-typed field (match as a string) is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = "~/a"\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
  });

  test("a wrong-typed worklogs field is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = 5\nindex_db = "~/idx.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
    expect(!result.ok && result.error.message).toContain("worklogs");
  });

  test("a wrong-typed index_db field is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = 5\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
    expect(!result.ok && result.error.message).toContain("index_db");
  });

  test("a wrong-typed exclude field is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "acme"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\nexclude = "oops"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
    expect(!result.ok && result.error.message).toContain("exclude");
  });

  test("a non-table workspace array entry is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, "workspace = [1, 2]\n");
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
  });
});

describe("saveRegistry", () => {
  test("writes atomically via a .tmp file then rename, leaving no .tmp behind", async () => {
    const fs = makeFsMemoryFake();
    await saveRegistry(fs, REGISTRY_PATH, [acme]);

    expect(await fs.exists(REGISTRY_PATH)).toBe(true);
    // SAFETY: test fixture only — appending a fixed suffix to an already-absolute
    // path for an existence check, never treated as a real path elsewhere.
    expect(await fs.exists(`${REGISTRY_PATH}.tmp` as AbsPath)).toBe(false);
    expect(await fs.readFile(REGISTRY_PATH)).toContain('id = "acme"');
  });

  test("creates the parent directory first", async () => {
    const fs = makeFsMemoryFake();
    await saveRegistry(fs, REGISTRY_PATH, [acme]);
    // SAFETY: test fixture only — slicing `REGISTRY_PATH` (already absolute and
    // normalized) at its last `/` yields another absolute, normalized path.
    const parent = REGISTRY_PATH.slice(0, REGISTRY_PATH.lastIndexOf("/")) as AbsPath;
    expect(await fs.exists(parent)).toBe(true);
  });
});

describe("findWorkspace", () => {
  test("returns the matching raw workspace by id", () => {
    expect(findWorkspace([acme, homeserver], "homeserver")).toEqual(homeserver);
  });

  test("returns null when no id matches", () => {
    expect(findWorkspace([acme, homeserver], "nope")).toBeNull();
  });
});

describe("expandWorkspace", () => {
  test("expands every path field to an absolute, normalized AbsPath", () => {
    const expanded = expandWorkspace(acme, HOME);
    expect(expanded.id).toBe("acme");
    expect(expanded.match).toEqual([expandPath("~/code/acme", HOME)]);
    expect(expanded.kb).toBe(expandPath("~/Documents/Acme Vault", HOME));
    expect(expanded.worklogs).toBe(expandPath("~/Documents/Acme Vault/_Worklogs", HOME));
    expect(expanded.indexDb).toBe(expandPath("~/.claude/memory/acme/index.db", HOME));
    expect(expanded.exclude).toEqual(acme.exclude);
  });

  test("matchedPrefix defaults to the first match entry", () => {
    const expanded = expandWorkspace(acme, HOME);
    expect(expanded.matchedPrefix).toBe(expandPath("~/code/acme", HOME));
  });

  test("matchedPrefix falls back to kb when match is empty", () => {
    const expanded = expandWorkspace({ ...acme, match: [] }, HOME);
    expect(expanded.matchedPrefix).toBe(expanded.kb);
  });
});

describe("validateNew", () => {
  test("no conflicts against an empty registry", () => {
    expect(validateNew(acme, [], HOME)).toEqual([]);
  });

  test("reports a missing required field", () => {
    const conflicts = validateNew({ ...acme, kb: "" }, [], HOME);
    expect(conflicts).toEqual([{ kind: RegistryConflictKind.MissingField, field: "kb" }]);
  });

  test("reports every missing required field at once", () => {
    const candidate: RawWorkspace = {
      id: "",
      match: [],
      kb: "",
      worklogs: "",
      exclude: [],
      indexDb: "",
    };
    const conflicts = validateNew(candidate, [], HOME);
    expect(conflicts).toEqual([
      { kind: RegistryConflictKind.MissingField, field: "id" },
      { kind: RegistryConflictKind.MissingField, field: "match" },
      { kind: RegistryConflictKind.MissingField, field: "kb" },
      { kind: RegistryConflictKind.MissingField, field: "worklogs" },
      { kind: RegistryConflictKind.MissingField, field: "index_db" },
    ]);
  });

  test("reports a duplicate id", () => {
    const conflicts = validateNew(
      { ...homeserver, match: ["~/Documents/other"], kb: "~/Documents/OtherVault" },
      [acme, homeserver],
      HOME,
    );
    expect(conflicts).toEqual([
      { kind: RegistryConflictKind.DuplicateId, id: "homeserver" },
    ]);
  });

  test("detects a match overlap when the new prefix is nested under an old one", () => {
    const candidate: RawWorkspace = {
      ...acme,
      id: "sub",
      match: ["~/code/acme/sub"],
      kb: "~/Documents/SubVault",
    };
    const conflicts = validateNew(candidate, [acme], HOME);
    expect(conflicts).toEqual([
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/code/acme/sub",
        otherId: "acme",
        otherPrefix: "~/code/acme",
      },
    ]);
  });

  test("detects a match overlap when the new prefix is an ancestor of an old one (the other direction)", () => {
    const candidate: RawWorkspace = {
      ...acme,
      id: "outer",
      // An ANCESTOR of acme's `~/code/acme` — the overlap must be detected in this
      // direction too, not just when the new prefix nests under an existing one.
      match: ["~/code"],
      kb: "~/Documents/OuterVault",
    };
    const conflicts = validateNew(candidate, [acme], HOME);
    expect(conflicts).toEqual([
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/code",
        otherId: "acme",
        otherPrefix: "~/code/acme",
      },
    ]);
  });

  test("detects kb nesting in either direction", () => {
    const nestedUnder: RawWorkspace = {
      ...homeserver,
      id: "sub",
      match: ["~/elsewhere"],
      kb: "~/Documents/Acme Vault/Sub",
    };
    expect(validateNew(nestedUnder, [acme], HOME)).toEqual([
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents/Acme Vault/Sub",
        otherId: "acme",
        otherKb: "~/Documents/Acme Vault",
      },
    ]);

    const ancestor: RawWorkspace = {
      ...homeserver,
      id: "outer",
      match: ["~/elsewhere"],
      kb: "~/Documents",
    };
    expect(validateNew(ancestor, [acme], HOME)).toEqual([
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents",
        otherId: "acme",
        otherKb: "~/Documents/Acme Vault",
      },
    ]);
  });

  test("returns every conflict at once, not just the first", () => {
    const candidate: RawWorkspace = {
      id: "acme", // duplicate
      match: ["~/code/acme/sub"], // overlaps acme's match
      kb: "~/Documents/Acme Vault/Sub", // nested under acme's kb
      worklogs: "~/Documents/Acme Vault/Sub/_Worklogs",
      exclude: [],
      indexDb: "~/.claude/memory/mate2/index.db",
    };
    const conflicts = validateNew(candidate, [acme], HOME);
    expect(conflicts).toEqual([
      { kind: RegistryConflictKind.DuplicateId, id: "acme" },
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/code/acme/sub",
        otherId: "acme",
        otherPrefix: "~/code/acme",
      },
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents/Acme Vault/Sub",
        otherId: "acme",
        otherKb: "~/Documents/Acme Vault",
      },
    ]);
  });

  test("a sibling directory sharing a string prefix is not a conflict", () => {
    const sibling: RawWorkspace = {
      ...acme,
      id: "sibling",
      match: ["~/code/acme2"],
      kb: "~/Documents/Acme Vault2",
    };
    expect(validateNew(sibling, [acme], HOME)).toEqual([]);
  });
});

describe("registry.toml round-trip", () => {
  test("parse -> serialize -> parse is byte-identical and structurally identical", async () => {
    const fixturePath = new URL("../testing/fixtures/registry.toml", import.meta.url)
      .pathname;
    const originalText = await Bun.file(fixturePath).text();

    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, originalText);

    const firstLoad = await loadRegistry(fs, REGISTRY_PATH);
    expect(firstLoad.ok).toBe(true);
    if (!firstLoad.ok) return;

    await saveRegistry(fs, REGISTRY_PATH, firstLoad.value);
    const rewrittenText = await fs.readFile(REGISTRY_PATH);

    // This file is user-owned and rewritten in place, so its output must be
    // byte-identical, not just structurally-equal.
    expect(rewrittenText).toBe(originalText);

    const secondLoad = await loadRegistry(fs, REGISTRY_PATH);
    expect(secondLoad).toEqual(firstLoad);
  });
});
