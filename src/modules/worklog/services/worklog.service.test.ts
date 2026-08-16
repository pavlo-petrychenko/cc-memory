import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { WorklogProjection } from "@/modules/worklog/projection/worklog.projection.ts";
import { WorklogQuery } from "@/modules/worklog/projection/worklog.query.ts";
import { WorklogService } from "@/modules/worklog/services/worklog.service.ts";
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

function makeService(
  fs: ReturnType<typeof makeFsMemoryFake>,
  index: SearchIndexFake,
): WorklogService {
  return new WorklogService(
    new WorklogStoreService(fs, makeGitFake()),
    new WorklogProjection(index),
    new WorklogQuery(index, new FtsQueryBuilder(new TokenizerParser()), new Ranker()),
  );
}

test("reindex reprojects worklog files into the index", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(
    expandPath("/kb/_Worklogs/wt1/2026-01-01.md", absPath("/")),
    "## 10:00 — incident\n**Changes:** rollback\n",
  );
  const index = new SearchIndexFake();

  await makeService(fs, index).reindex(ws);
  expect(index.projected[0]?.documents).toHaveLength(1);
  expect(index.projected[0]?.documents[0]?.slug).toBe("wt1");
});

test("search delegates to the worklog query", async () => {
  const index = new SearchIndexFake();
  index.setNextHits([
    {
      path: absPath("/kb/_Worklogs/wt1/2026-01-01.md"),
      title: "wt1",
      snippet: "…",
      score: -1,
    },
  ]);
  index.setNextInlinks(new Map());

  const hits = await makeService(makeFsMemoryFake(), index).search(ws, "rollback", {
    limit: 5,
    linkBoost: 0.003,
  });
  expect(hits).toHaveLength(1);
});
