import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Note, NoteRelation } from "@/modules/note/note.entity.ts";

test("a Note combines parsed fields with the path that identifies it", () => {
  const relations: readonly NoteRelation[] = [
    { relationType: "depends_on", target: "Other/Note" },
  ];
  const note: Note = {
    path: absPath("/vault/Alpha/Injection Hook.md"),
    title: "Injection Hook",
    type: "note",
    importance: 6,
    body: "The hook extracts salient tokens.",
    tags: "hooks",
    rels: relations,
  };

  expect(note.path).toBe(absPath("/vault/Alpha/Injection Hook.md"));
  expect(note.rels).toEqual(relations);
  expect(note.importance).toBe(6);
});
