import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteQuery } from "@/modules/note/projection/note.query.ts";
import { SearchNotesUseCase } from "@/modules/note/useCases/searchNotes.useCase.ts";

const ws: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("searchNotes delegates to the note query", async () => {
  const index = new SearchIndexFake();
  index.setNextHits([{ path: absPath("/kb/A.md"), title: "A", snippet: "…", score: -1 }]);
  index.setNextInlinks(new Map());
  const useCase = new SearchNotesUseCase(
    new NoteQuery(index, new FtsQueryBuilder(new TokenizerParser()), new Ranker()),
  );

  const hits = await useCase.run(ws, "a", { limit: 5, linkBoost: 0.003 });
  expect(hits).toHaveLength(1);
});
