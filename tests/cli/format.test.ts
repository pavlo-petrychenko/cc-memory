/**
 * Golden-string tests for every `format.ts` function — C3's exact output
 * shapes, transcribed character-for-character from `bin/memory`'s `print()`
 * calls (see the doc comments in `src/cli/format.ts` for the exact source
 * lines each one ports).
 */
import { describe, expect, test } from "bun:test";

import {
  formatCommitResult,
  formatCommitSkipped,
  formatCwdResolution,
  formatHookNotImplemented,
  formatNoNotes,
  formatNoteLine,
  formatNoWorkspaceForCwd,
  formatReflectNotImplemented,
  formatRegistryStatus,
  formatReindexLine,
  formatResolveLines,
  formatSearchHit,
  formatWorkspaceAdded,
  formatWorkspaceLsMatch,
  formatWorkspaceLsRow,
  formatWorkspaceRemovedPurged,
  formatWorkspaceUnregistered,
  NO_HITS_MESSAGE,
  NO_WORKSPACES_MESSAGE,
} from "../../src/cli/format.ts";

describe("format.ts", () => {
  test("formatWorkspaceAdded — bin/memory:64-68", () => {
    expect(
      formatWorkspaceAdded("mate", "/vault", "/vault/_Worklogs", "/idx/index.db", 12, [
        "/repo/a",
        "/repo/b",
      ]),
    ).toEqual([
      "✓ workspace 'mate' added",
      "  kb       /vault",
      "  worklogs /vault/_Worklogs",
      "  index_db /idx/index.db  (12 notes)",
      "  match    /repo/a, /repo/b",
    ]);
  });

  test("formatWorkspaceRemovedPurged — bin/memory:84", () => {
    expect(formatWorkspaceRemovedPurged("mate")).toBe(
      "✓ workspace 'mate' removed (index purged; vault left intact)",
    );
  });

  test("formatWorkspaceUnregistered — bin/memory:86", () => {
    expect(formatWorkspaceUnregistered("mate")).toBe(
      "✓ workspace 'mate' unregistered (data left intact)",
    );
  });

  test("NO_WORKSPACES_MESSAGE — bin/memory:92", () => {
    expect(NO_WORKSPACES_MESSAGE).toBe("(no workspaces)");
  });

  test("formatWorkspaceLsRow pads the id to width 12 — bin/memory:104", () => {
    expect(formatWorkspaceLsRow("mate", "/vault", "7")).toBe(
      "• mate         /vault  [7 notes]",
    );
    expect(formatWorkspaceLsRow("a-very-long-workspace-id", "/vault", "?")).toBe(
      "• a-very-long-workspace-id /vault  [? notes]",
    );
  });

  test("formatWorkspaceLsMatch — bin/memory:105", () => {
    expect(formatWorkspaceLsMatch(["/a", "/b"])).toBe("  match: /a, /b");
  });

  test("formatNoWorkspaceForCwd — bin/memory:114", () => {
    expect(formatNoWorkspaceForCwd("/outside")).toBe("no workspace for /outside");
  });

  test("formatResolveLines — bin/memory:116-120", () => {
    expect(
      formatResolveLines("primary", "wt1", "/kb", "/kb/_Worklogs", "/idx/index.db"),
    ).toEqual([
      "workspace: primary",
      "slug:      wt1",
      "kb:        /kb",
      "worklogs:  /kb/_Worklogs",
      "index_db:  /idx/index.db",
    ]);
  });

  test("formatReindexLine — bin/memory:135-136", () => {
    expect(formatReindexLine("primary", 2, 1, 0, 8)).toBe("primary: +2 ~1 -0 = 8 notes");
  });

  test("NO_HITS_MESSAGE — bin/memory:148", () => {
    expect(NO_HITS_MESSAGE).toBe("(no hits)");
  });

  test("formatSearchHit — bin/memory:152", () => {
    expect(
      formatSearchHit("Kryptonite Handbook", "Beta/Title Kryptonite.md", "…snippet…"),
    ).toEqual(["• Kryptonite Handbook  (Beta/Title Kryptonite.md)", "  …snippet…"]);
  });

  test("formatNoNotes — bin/memory:172", () => {
    expect(formatNoNotes(null)).toBe("(no notes)");
    expect(formatNoNotes("Alpha")).toBe("(no notes) under Alpha");
  });

  test("formatNoteLine — bin/memory:176 (importance present, right-justified width 2)", () => {
    expect(formatNoteLine(6, "note", "Alpha/Injection Hook.md", "Injection Hook")).toBe(
      "[ 6] note   Alpha/Injection Hook.md  — Injection Hook",
    );
  });

  test("formatNoteLine — missing importance renders '-'", () => {
    expect(formatNoteLine(null, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ -] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("formatNoteLine — a two-digit importance is not truncated by the width-2 field", () => {
    expect(formatNoteLine(10, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[10] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("formatNoteLine — an empty type string falls back to 'note' (`r['type'] or 'note'`)", () => {
    expect(formatNoteLine(5, "", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ 5] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("formatCommitSkipped — bin/memory:185", () => {
    expect(formatCommitSkipped("primary")).toBe("primary: not a git repo, skipping");
  });

  test("formatCommitResult — bin/memory:190", () => {
    expect(formatCommitResult("primary", true)).toBe("primary: committed");
    expect(formatCommitResult("primary", false)).toBe("primary: nothing to commit");
  });

  test("formatRegistryStatus — bin/memory:214", () => {
    expect(formatRegistryStatus("/reg.toml", "(ok)")).toBe("registry: /reg.toml (ok)");
  });

  test("formatCwdResolution — bin/memory:217", () => {
    expect(formatCwdResolution("/proj", "primary")).toBe("cwd /proj -> primary");
    expect(formatCwdResolution("/proj", "no workspace")).toBe(
      "cwd /proj -> no workspace",
    );
  });

  test("formatHookNotImplemented", () => {
    expect(formatHookNotImplemented("session-start")).toBe(
      "  session-start: (not implemented yet)",
    );
  });

  test("formatReflectNotImplemented", () => {
    expect(formatReflectNotImplemented("primary")).toBe(
      "primary: reflect not implemented yet (P8)",
    );
  });
});
