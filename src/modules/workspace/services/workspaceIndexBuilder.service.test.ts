import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { WorkspaceIndexBuilderService } from "@/modules/workspace/services/workspaceIndexBuilder.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const WORKSPACE: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("buildIndex reindexes the vault and returns the note total", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(absPath("/kb/A.md"), "---\ntype: note\nimportance: 6\n---\n# A\nbody\n");
  const index = new SearchIndexFake();
  const service = new WorkspaceIndexBuilderService(makeAppContext({ fs }, index));

  expect(await service.buildIndex(WORKSPACE)).toBe(1);
});

test("noteCount returns the number of notes already in the index", async () => {
  const index = new SearchIndexFake();
  index.setNextExisting(new Map([[absPath("/kb/A.md"), 1]]));
  const service = new WorkspaceIndexBuilderService(makeAppContext({}, index));

  expect(await service.noteCount(WORKSPACE)).toBe(1);
});
