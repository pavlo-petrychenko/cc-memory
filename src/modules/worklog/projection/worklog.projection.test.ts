import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection, SearchIndexFake } from "@/gateways/index.ts";
import { WorklogProjection } from "@/modules/worklog/projection/worklog.projection.ts";

const workspace: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("WorklogProjection maps worklog files into the Worklog collection", async () => {
  const index = new SearchIndexFake();
  const projection = new WorklogProjection(index);

  await projection.project(workspace, [
    {
      path: absPath("/kb/_Worklogs/wt1/2026-01-01.md"),
      slug: "wt1",
      date: "2026-01-01",
      body: "rollback incident",
      mtimeMs: 1,
    },
  ]);

  expect(index.projected[0]?.collection).toBe(Collection.Worklog);
  expect(index.projected[0]?.documents[0]?.slug).toBe("wt1");
});
