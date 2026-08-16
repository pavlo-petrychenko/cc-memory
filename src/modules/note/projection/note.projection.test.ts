import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { Collection, SearchIndexFake } from "@/gateways/index.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";
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

test("NoteProjection maps Notes into the Notes collection", async () => {
  const index = new SearchIndexFake();
  const projection = new NoteProjection(makeAppContext({}, index));

  index.setResetResult(true);
  expect(await projection.resetIfStale(workspace)).toBe(true);

  const note = {
    path: absPath("/kb/A.md"),
    title: "A",
    type: "note",
    importance: null,
    body: "body",
    tags: "",
    rels: [],
  };
  await projection.project(workspace, [{ note, mtimeMs: 1 }]);
  await projection.prune(workspace, new Set(["/kb/A.md"]));

  expect(index.projected).toHaveLength(1);
  expect(index.projected[0]?.collection).toBe(Collection.Notes);
  expect(index.projected[0]?.documents[0]?.title).toBe("A");
});
