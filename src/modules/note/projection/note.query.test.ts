import { expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteQuery } from "@/modules/note/projection/note.query.ts";

const workspace: Workspace = {
  id: "w",
  match: [absPath("/repo")],
  kb: absPath("/kb"),
  worklogs: absPath("/kb/_Worklogs"),
  exclude: [],
  indexDb: absPath("/mem/w/index.db"),
  matchedPrefix: absPath("/repo"),
};

test("NoteQuery fuses token and phrase hits through the SearchIndex", async () => {
  const index = new SearchIndexFake();
  const hit = {
    path: absPath("/kb/Injection Hook.md"),
    title: "Injection Hook",
    snippet: "the hook extracts salient tokens",
    score: -1.5,
  };
  index.setNextHits([hit]);
  index.setNextInlinks(new Map());

  const query = new NoteQuery(
    index,
    new FtsQueryBuilder(new TokenizerParser()),
    new Ranker(),
  );
  const fused = await query.searchFused(workspace, "injecting tokens", {
    limit: 5,
    linkBoost: 0.003,
  });

  expect(fused).toHaveLength(1);
  expect(fused[0]?.path).toBe(hit.path);
  expect(fused[0]?.rankScore).toBeGreaterThan(0);
});
