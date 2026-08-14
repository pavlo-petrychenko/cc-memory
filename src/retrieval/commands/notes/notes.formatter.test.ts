import { describe, expect, test } from "bun:test";

import {
  formatNoNotes,
  formatNoteLine,
} from "@/retrieval/commands/notes/notes.formatter.ts";

describe("formatNoNotes", () => {
  test("no folder", () => {
    expect(formatNoNotes(null)).toBe("(no notes)");
  });

  test("with a folder", () => {
    expect(formatNoNotes("Alpha")).toBe("(no notes) under Alpha");
  });
});

describe("formatNoteLine", () => {
  test("importance present, right-justified width 2", () => {
    expect(formatNoteLine(6, "note", "Alpha/Injection Hook.md", "Injection Hook")).toBe(
      "[ 6] note   Alpha/Injection Hook.md  — Injection Hook",
    );
  });

  test("missing importance renders '-'", () => {
    expect(formatNoteLine(null, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ -] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("a two-digit importance is not truncated by the width-2 field", () => {
    expect(formatNoteLine(10, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[10] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("an empty type string falls back to 'note'", () => {
    expect(formatNoteLine(5, "", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ 5] note   Alpha/Alpha.md  — Alpha",
    );
  });
});
