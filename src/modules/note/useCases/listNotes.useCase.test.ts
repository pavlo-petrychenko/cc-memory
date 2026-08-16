import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { ListNotesUseCase } from "@/modules/note/useCases/listNotes.useCase.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

const ws: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("listNotes enumerates vault notes", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(absPath("/kb/A.md"), "---\ntype: note\n---\n# A\n");
  const useCase = new ListNotesUseCase(new NoteRepository(fs, new NoteParser()));

  const summaries = await useCase.run(ws);
  expect(summaries.map((summary) => summary.path)).toEqual(["A.md"]);
});
