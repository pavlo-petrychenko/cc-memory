import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection } from "@/gateways/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
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

test("WorklogProjection delegates to the SearchIndex with the Worklog collection", async () => {
  const index = new SearchIndexFake();
  const projection = new WorklogProjection(index);

  const document = {
    path: absPath("/kb/_Worklogs/wt1/2026-01-01.md"),
    title: "",
    body: "rollback incident",
    tags: "",
    type: "",
    importance: null,
    relations: [],
    slug: "wt1",
    date: "2026-01-01",
    mtimeMs: 1,
  };
  await projection.project(workspace, [document]);

  expect(index.projected).toEqual([
    { collection: Collection.Worklog, documents: [document] },
  ]);
});
