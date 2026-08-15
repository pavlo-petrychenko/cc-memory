import { describe, expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { RegistryConflictKind } from "@/modules/workspace/workspace.typedefs.ts";
import {
  findWorkspace,
  expandWorkspace,
  validateNew,
} from "@/modules/workspace/workspace.validator.service.ts";

// SAFETY: a fixed test fixture — a hand-written, already-absolute path literal.
const HOME = absPath("/home/test");

const acme: RawWorkspace = {
  id: "acme",
  match: ["~/code/acme"],
  kb: "~/Documents/Acme Vault",
  worklogs: "~/Documents/Acme Vault/_Worklogs",
  exclude: ["_Worklogs"],
  indexDb: "~/.claude/memory/acme/index.db",
};

describe("workspace validator free functions", () => {
  test("findWorkspace returns the matching raw workspace or null", () => {
    expect(findWorkspace([acme], "acme")).toEqual(acme);
    expect(findWorkspace([acme], "nope")).toBeNull();
  });

  test("expandWorkspace expands every path field", () => {
    const expanded = expandWorkspace(acme, HOME);
    expect(expanded.id).toBe("acme");
    expect(expanded.kb).toBe(expandPath("~/Documents/Acme Vault", HOME));
  });

  test("validateNew flags a duplicate id", () => {
    const conflicts = validateNew(acme, [acme], HOME);
    expect(conflicts).toContainEqual({
      kind: RegistryConflictKind.DuplicateId,
      id: "acme",
    });
  });

  test("validateNew flags a missing required field", () => {
    const conflicts = validateNew({ ...acme, id: "" }, [], HOME);
    expect(conflicts).toContainEqual({
      kind: RegistryConflictKind.MissingField,
      field: "id",
    });
  });
});
