import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection } from "@/gateways/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";

const workspace: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("NoteProjection delegates to the SearchIndex with the Notes collection", async () => {
  const index = new SearchIndexFake();
  const projection = new NoteProjection(index);

  index.setResetResult(true);
  expect(await projection.resetIfStale(workspace)).toBe(true);

  const document = {
    path: absPath("/kb/A.md"),
    title: "A",
    body: "",
    tags: "",
    type: "note",
    importance: null,
    relations: [],
    slug: "",
    date: "",
    mtimeMs: 1,
  };
  await projection.project(workspace, [document]);
  await projection.prune(workspace, new Set(["/kb/A.md"]));

  expect(index.projected).toEqual([
    { collection: Collection.Notes, documents: [document] },
  ]);
});
