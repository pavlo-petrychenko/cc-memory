import { describe, expect, test } from "bun:test";

import { NotesFormatter } from "@/retrieval/commands/notes/notes.formatter.ts";

const notesFormatter = new NotesFormatter();

describe("NotesFormatter.noNotes", () => {
  test("no folder", () => {
    expect(notesFormatter.noNotes(null)).toBe("(no notes)");
  });

  test("with a folder", () => {
    expect(notesFormatter.noNotes("Alpha")).toBe("(no notes) under Alpha");
  });
});

describe("NotesFormatter.noteLine", () => {
  test("importance present, right-justified width 2", () => {
    expect(
      notesFormatter.noteLine(6, "note", "Alpha/Injection Hook.md", "Injection Hook"),
    ).toBe("[ 6] note   Alpha/Injection Hook.md  — Injection Hook");
  });

  test("missing importance renders '-'", () => {
    expect(notesFormatter.noteLine(null, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ -] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("a two-digit importance is not truncated by the width-2 field", () => {
    expect(notesFormatter.noteLine(10, "note", "Alpha/Alpha.md", "Alpha")).toBe(
      "[10] note   Alpha/Alpha.md  — Alpha",
    );
  });

  test("an empty type string falls back to 'note'", () => {
    expect(notesFormatter.noteLine(5, "", "Alpha/Alpha.md", "Alpha")).toBe(
      "[ 5] note   Alpha/Alpha.md  — Alpha",
    );
  });
});
