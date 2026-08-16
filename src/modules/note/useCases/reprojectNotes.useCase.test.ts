import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { ReprojectNotesUseCase } from "@/modules/note/useCases/reprojectNotes.useCase.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

function workspace(): Workspace {
  return {
    id: "w",
    match: [absPath("/repo")],
    kb: absPath("/kb"),
    worklogs: absPath("/kb/_Worklogs"),
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: absPath("/mem/w/index.db"),
    matchedPrefix: absPath("/repo"),
  };
}

const NOTE_TEXT = `---
type: note
importance: 6
---
# Injection Hook
The hook extracts salient tokens.
`;

test("reprojects the vault into the index with added/updated/removed counts", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(expandPath("/kb/Alpha.md", absPath("/")), NOTE_TEXT);
  const index = new SearchIndexFake();
  const useCase = new ReprojectNotesUseCase(
    new NoteRepository(fs, new NoteParser()),
    new NoteProjection(index),
  );

  const stats = await useCase.run(workspace(), { incremental: true });
  expect(stats).toEqual({ added: 1, updated: 0, removed: 0, total: 1 });
  expect(index.projected[0]?.documents).toHaveLength(1);
  expect(index.projected[0]?.documents[0]?.title).toBe("Injection Hook");
});
