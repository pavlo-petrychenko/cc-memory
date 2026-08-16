import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteService } from "@/modules/note/services/note.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

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

test("incrementalReindex reprojects the vault with added/updated/removed counts", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(expandPath("/kb/Alpha.md", absPath("/")), NOTE_TEXT);
  const index = new SearchIndexFake();
  const service = new NoteService(makeAppContext({ fs }, index));

  const stats = await service.incrementalReindex(workspace());
  expect(stats).toEqual({ added: 1, updated: 0, removed: 0, total: 1 });
  expect(index.projected[0]?.documents).toHaveLength(1);
  expect(index.projected[0]?.documents[0]?.title).toBe("Injection Hook");
});

test("search delegates to the note query", async () => {
  const index = new SearchIndexFake();
  index.setNextHits([{ path: absPath("/kb/A.md"), title: "A", snippet: "…", score: -1 }]);
  index.setNextInlinks(new Map());
  const service = new NoteService(makeAppContext({}, index));

  const hits = await service.search(workspace(), "a", {
    limit: 5,
    linkBoost: 0.003,
  });
  expect(hits).toHaveLength(1);
});
