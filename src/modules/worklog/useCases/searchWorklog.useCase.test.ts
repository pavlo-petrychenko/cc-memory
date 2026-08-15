import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { WorklogQuery } from "@/modules/worklog/projection/worklog.query.ts";
import { SearchWorklogUseCase } from "@/modules/worklog/useCases/searchWorklog.useCase.ts";

const ws: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("searchWorklog delegates to the worklog query", async () => {
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
  const useCase = new SearchWorklogUseCase(
    new WorklogQuery(index, new FtsQueryBuilder(new TokenizerParser()), new Ranker()),
  );

  const hits = await useCase.run(ws, "rollback", { limit: 5, linkBoost: 0.003 });
  expect(hits).toHaveLength(1);
});
