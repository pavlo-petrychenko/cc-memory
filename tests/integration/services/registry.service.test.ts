import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../src/domain/paths.ts";
import type { RawWorkspace } from "../../../src/domain/Workspace.ts";
import {
  defaultRegistryPath,
  expandWorkspace,
  findWorkspace,
  loadRegistry,
  RegistryConflictKind,
  RegistryErrorKind,
  saveRegistry,
  validateNew,
} from "../../../src/services/registry.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — same pattern as
// `tests/unit/domain/paths.test.ts`'s `HOME`.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const mate: RawWorkspace = {
  id: "mate",
  match: ["~/Desktop/project"],
  kb: "~/Documents/Mate Vault",
  worklogs: "~/Documents/Mate Vault/_Worklogs",
  exclude: ["_Worklogs", "Archive", ".obsidian"],
  indexDb: "~/.claude/memory/mate/index.db",
};

const personal: RawWorkspace = {
  id: "personal",
  match: ["~/Documents/personal"],
  kb: "~/Documents/Personal Vault",
  worklogs: "~/Documents/Personal Vault/_Worklogs",
  exclude: ["_Worklogs", "Archive", ".obsidian"],
  indexDb: "~/.claude/memory/personal/index.db",
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
      '[[workspace]]\nid = "mate"\nmatch = ["~/Desktop/project"]\nkb = "~/Documents/Mate Vault"\nworklogs = "~/Documents/Mate Vault/_Worklogs"\nexclude = ["_Worklogs"]\nindex_db = "~/.claude/memory/mate/index.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result).toEqual({ ok: true, value: [{ ...mate, exclude: ["_Worklogs"] }] });
  });

  test("a workspace table with no exclude defaults it to []", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "mate"\nmatch = ["~/Desktop/project"]\nkb = "~/Documents/Mate Vault"\nworklogs = "~/Documents/Mate Vault/_Worklogs"\nindex_db = "~/.claude/memory/mate/index.db"\n',
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
      '[[workspace]]\nid = "mate"\nmatch = "~/a"\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\n',
    );
    const result = await loadRegistry(fs, REGISTRY_PATH);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(RegistryErrorKind.Malformed);
  });

  test("a wrong-typed worklogs field is a typed Malformed error", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      REGISTRY_PATH,
      '[[workspace]]\nid = "mate"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = 5\nindex_db = "~/idx.db"\n',
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
      '[[workspace]]\nid = "mate"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = 5\n',
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
      '[[workspace]]\nid = "mate"\nmatch = ["~/a"]\nkb = "~/kb"\nworklogs = "~/kb/_Worklogs"\nindex_db = "~/idx.db"\nexclude = "oops"\n',
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
    await saveRegistry(fs, REGISTRY_PATH, [mate]);

    expect(await fs.exists(REGISTRY_PATH)).toBe(true);
    // SAFETY: test fixture only — appending a fixed suffix to an already-absolute
    // path for an existence check, never treated as a real path elsewhere.
    expect(await fs.exists(`${REGISTRY_PATH}.tmp` as AbsPath)).toBe(false);
    expect(await fs.readFile(REGISTRY_PATH)).toContain('id = "mate"');
  });

  test("creates the parent directory first", async () => {
    const fs = makeFsMemoryFake();
    await saveRegistry(fs, REGISTRY_PATH, [mate]);
    // SAFETY: test fixture only — slicing `REGISTRY_PATH` (already absolute and
    // normalized) at its last `/` yields another absolute, normalized path.
    const parent = REGISTRY_PATH.slice(0, REGISTRY_PATH.lastIndexOf("/")) as AbsPath;
    expect(await fs.exists(parent)).toBe(true);
  });
});

describe("findWorkspace", () => {
  test("returns the matching raw workspace by id", () => {
    expect(findWorkspace([mate, personal], "personal")).toEqual(personal);
  });

  test("returns null when no id matches", () => {
    expect(findWorkspace([mate, personal], "nope")).toBeNull();
  });
});

describe("expandWorkspace", () => {
  test("expands every path field to an absolute, normalized AbsPath", () => {
    const expanded = expandWorkspace(mate, HOME);
    expect(expanded.id).toBe("mate");
    expect(expanded.match).toEqual([expandPath("~/Desktop/project", HOME)]);
    expect(expanded.kb).toBe(expandPath("~/Documents/Mate Vault", HOME));
    expect(expanded.worklogs).toBe(expandPath("~/Documents/Mate Vault/_Worklogs", HOME));
    expect(expanded.indexDb).toBe(expandPath("~/.claude/memory/mate/index.db", HOME));
    expect(expanded.exclude).toEqual(mate.exclude);
  });

  test("matchedPrefix defaults to the first match entry", () => {
    const expanded = expandWorkspace(mate, HOME);
    expect(expanded.matchedPrefix).toBe(expandPath("~/Desktop/project", HOME));
  });

  test("matchedPrefix falls back to kb when match is empty", () => {
    const expanded = expandWorkspace({ ...mate, match: [] }, HOME);
    expect(expanded.matchedPrefix).toBe(expanded.kb);
  });
});

describe("validateNew", () => {
  test("no conflicts against an empty registry", () => {
    expect(validateNew(mate, [], HOME)).toEqual([]);
  });

  test("reports a missing required field", () => {
    const conflicts = validateNew({ ...mate, kb: "" }, [], HOME);
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
      { ...personal, match: ["~/Documents/other"], kb: "~/Documents/OtherVault" },
      [mate, personal],
      HOME,
    );
    expect(conflicts).toEqual([
      { kind: RegistryConflictKind.DuplicateId, id: "personal" },
    ]);
  });

  test("detects a match overlap when the new prefix is nested under an old one", () => {
    const candidate: RawWorkspace = {
      ...mate,
      id: "sub",
      match: ["~/Desktop/project/sub"],
      kb: "~/Documents/SubVault",
    };
    const conflicts = validateNew(candidate, [mate], HOME);
    expect(conflicts).toEqual([
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/Desktop/project/sub",
        otherId: "mate",
        otherPrefix: "~/Desktop/project",
      },
    ]);
  });

  test("detects a match overlap when the new prefix is an ancestor of an old one (the other direction)", () => {
    const candidate: RawWorkspace = {
      ...mate,
      id: "outer",
      match: ["~/Desktop"],
      kb: "~/Documents/OuterVault",
    };
    const conflicts = validateNew(candidate, [mate], HOME);
    expect(conflicts).toEqual([
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/Desktop",
        otherId: "mate",
        otherPrefix: "~/Desktop/project",
      },
    ]);
  });

  test("detects kb nesting in either direction", () => {
    const nestedUnder: RawWorkspace = {
      ...personal,
      id: "sub",
      match: ["~/elsewhere"],
      kb: "~/Documents/Mate Vault/Sub",
    };
    expect(validateNew(nestedUnder, [mate], HOME)).toEqual([
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents/Mate Vault/Sub",
        otherId: "mate",
        otherKb: "~/Documents/Mate Vault",
      },
    ]);

    const ancestor: RawWorkspace = {
      ...personal,
      id: "outer",
      match: ["~/elsewhere"],
      kb: "~/Documents",
    };
    expect(validateNew(ancestor, [mate], HOME)).toEqual([
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents",
        otherId: "mate",
        otherKb: "~/Documents/Mate Vault",
      },
    ]);
  });

  test("returns every conflict at once, not just the first (unlike registry.py's raise-on-first)", () => {
    const candidate: RawWorkspace = {
      id: "mate", // duplicate
      match: ["~/Desktop/project/sub"], // overlaps mate's match
      kb: "~/Documents/Mate Vault/Sub", // nested under mate's kb
      worklogs: "~/Documents/Mate Vault/Sub/_Worklogs",
      exclude: [],
      indexDb: "~/.claude/memory/mate2/index.db",
    };
    const conflicts = validateNew(candidate, [mate], HOME);
    expect(conflicts).toEqual([
      { kind: RegistryConflictKind.DuplicateId, id: "mate" },
      {
        kind: RegistryConflictKind.MatchOverlap,
        prefix: "~/Desktop/project/sub",
        otherId: "mate",
        otherPrefix: "~/Desktop/project",
      },
      {
        kind: RegistryConflictKind.KbNested,
        kb: "~/Documents/Mate Vault/Sub",
        otherId: "mate",
        otherKb: "~/Documents/Mate Vault",
      },
    ]);
  });

  test("a sibling directory sharing a string prefix is not a conflict", () => {
    const sibling: RawWorkspace = {
      ...mate,
      id: "sibling",
      match: ["~/Desktop/project2"],
      kb: "~/Documents/Mate Vault2",
    };
    expect(validateNew(sibling, [mate], HOME)).toEqual([]);
  });
});

describe("C1 — real registry.toml round-trip", () => {
  test("parse -> serialize -> parse is byte-identical and structurally identical", async () => {
    const fixturePath = new URL("../../fixtures/registry.toml", import.meta.url).pathname;
    const originalText = await Bun.file(fixturePath).text();

    const fs = makeFsMemoryFake();
    fs.seedFile(REGISTRY_PATH, originalText);

    const firstLoad = await loadRegistry(fs, REGISTRY_PATH);
    expect(firstLoad.ok).toBe(true);
    if (!firstLoad.ok) return;

    await saveRegistry(fs, REGISTRY_PATH, firstLoad.value);
    const rewrittenText = await fs.readFile(REGISTRY_PATH);

    // C1: byte-identical output, not just structurally-equal.
    expect(rewrittenText).toBe(originalText);

    const secondLoad = await loadRegistry(fs, REGISTRY_PATH);
    expect(secondLoad).toEqual(firstLoad);
  });
});
