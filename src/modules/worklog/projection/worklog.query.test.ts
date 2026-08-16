import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { WorklogQuery } from "@/modules/worklog/projection/worklog.query.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const workspace: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("WorklogQuery fuses token and phrase hits through the SearchIndex", async () => {
  const index = new SearchIndexFake();
  const hit = {
    path: absPath("/kb/_Worklogs/wt1/2026-01-01.md"),
    title: "wt1",
    snippet: "rollback incident",
    score: -1.5,
  };
  index.setNextHits([hit]);
  index.setNextInlinks(new Map());

  const query = new WorklogQuery(makeAppContext({}, index));
  const fused = await query.searchFused(workspace, "rollback gateway", {
    limit: 5,
    linkBoost: 0.003,
  });

  expect(fused).toHaveLength(1);
  expect(fused[0]?.title).toBe("wt1");
});
