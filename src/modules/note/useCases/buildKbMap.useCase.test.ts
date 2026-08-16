import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { KbMapService } from "@/modules/note/kbMap.repository.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { BuildKbMapUseCase } from "@/modules/note/useCases/buildKbMap.useCase.ts";
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

test("buildKbMap builds the top-level KB map", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(
    expandPath("/kb/Alpha/Alpha.md", absPath("/")),
    "---\ntype: index\n---\n# Alpha\n> The Alpha feature.\n",
  );
  const useCase = new BuildKbMapUseCase(new KbMapService(fs, new NoteParser()));

  const map = await useCase.run(ws, absPath("/"));
  expect(map?.features.map((feature) => feature.name)).toEqual(["Alpha"]);
});
