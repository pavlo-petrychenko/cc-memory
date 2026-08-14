/**
 * Golden-string tests for every `format.ts` function — the exact output
 * shapes, character-for-character.
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
  test("formatWorkspaceAdded", () => {
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

  test("formatWorkspaceRemovedPurged", () => {
    expect(formatWorkspaceRemovedPurged("mate")).toBe(
      "✓ workspace 'mate' removed (index purged; vault left intact)",
    );
  });

  test("formatWorkspaceUnregistered", () => {
    expect(formatWorkspaceUnregistered("mate")).toBe(
      "✓ workspace 'mate' unregistered (data left intact)",
    );
  });

  test("NO_WORKSPACES_MESSAGE", () => {
    expect(NO_WORKSPACES_MESSAGE).toBe("(no workspaces)");
  });

  test("formatWorkspaceLsRow pads the id to width 12", () => {
    expect(formatWorkspaceLsRow("mate", "/vault", "7")).toBe(
      "• mate         /vault  [7 notes]",
    );
    expect(formatWorkspaceLsRow("a-very-long-workspace-id", "/vault", "?")).toBe(
      "• a-very-long-workspace-id /vault  [? notes]",
    );
  });

  test("formatWorkspaceLsMatch", () => {
    expect(formatWorkspaceLsMatch(["/a", "/b"])).toBe("  match: /a, /b");
  });

  test("formatNoWorkspaceForCwd", () => {
    expect(formatNoWorkspaceForCwd("/outside")).toBe("no workspace for /outside");
  });

  test("formatResolveLines", () => {
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

  test("formatReindexLine", () => {
    expect(formatReindexLine("primary", 2, 1, 0, 8)).toBe("primary: +2 ~1 -0 = 8 notes");
  });

  test("NO_HITS_MESSAGE", () => {
    expect(NO_HITS_MESSAGE).toBe("(no hits)");
  });

  test("formatSearchHit", () => {
    expect(
      formatSearchHit("Kryptonite Handbook", "Beta/Title Kryptonite.md", "…snippet…"),
    ).toEqual(["• Kryptonite Handbook  (Beta/Title Kryptonite.md)", "  …snippet…"]);
  });

  test("formatNoNotes", () => {
    expect(formatNoNotes(null)).toBe("(no notes)");
    expect(formatNoNotes("Alpha")).toBe("(no notes) under Alpha");
  });

  test("formatNoteLine — importance present, right-justified width 2", () => {
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

  test("formatNoteLine — an empty type string falls back to 'note'", () => {
    expect(formatNoteLine(5, "", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ 5] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("formatCommitSkipped", () => {
    expect(formatCommitSkipped("primary")).toBe("primary: not a git repo, skipping");
  });

  test("formatCommitResult", () => {
    expect(formatCommitResult("primary", true)).toBe("primary: committed");
    expect(formatCommitResult("primary", false)).toBe("primary: nothing to commit");
  });

  test("formatRegistryStatus", () => {
    expect(formatRegistryStatus("/reg.toml", "(ok)")).toBe("registry: /reg.toml (ok)");
  });

  test("formatCwdResolution", () => {
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
});
