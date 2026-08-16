import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { WorklogProjection } from "@/modules/worklog/projection/worklog.projection.ts";
import { ReprojectWorklogUseCase } from "@/modules/worklog/useCases/reprojectWorklog.useCase.ts";
import { WorklogStoreService } from "@/modules/worklog/worklog.repository.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";

const ws: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("reprojects worklog files into the index", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(
    expandPath("/kb/_Worklogs/wt1/2026-01-01.md", absPath("/")),
    "## 10:00 — incident\n**Changes:** rollback\n",
  );
  const index = new SearchIndexFake();
  const useCase = new ReprojectWorklogUseCase(
    new WorklogStoreService(fs, makeGitFake()),
    new WorklogProjection(index),
  );

  await useCase.run(ws);
  expect(index.projected[0]?.documents).toHaveLength(1);
  expect(index.projected[0]?.documents[0]?.slug).toBe("wt1");
});
