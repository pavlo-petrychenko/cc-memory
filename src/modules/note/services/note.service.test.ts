import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { NoteProjection } from "@/modules/note/projection/note.projection.ts";
import { NoteQuery } from "@/modules/note/projection/note.query.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { NoteService } from "@/modules/note/services/note.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

function workspace(): Workspace {
  return {
    id: "w",
    match: [absPath("/repo")],
    kb: absPath("/kb"),
    worklogs: absPath("/kb/_Worklogs"),
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: absPath("/mem/w/index.db"),
    matchedPrefix: absPath("/repo"),
  };
}

const NOTE_TEXT = `---
type: note
importance: 6
---
# Injection Hook
The hook extracts salient tokens.
`;

function makeService(index: SearchIndexFake): NoteService {
  return new NoteService(
    new NoteRepository(makeFsMemoryFake(), new NoteParser()),
    new NoteProjection(index),
    new NoteQuery(index, new FtsQueryBuilder(new TokenizerParser()), new Ranker()),
  );
}

test("incrementalReindex reprojects the vault with added/updated/removed counts", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(expandPath("/kb/Alpha.md", absPath("/")), NOTE_TEXT);
  const index = new SearchIndexFake();

  // The repository was built over its own fs; rebuild the service over the
  // seeded fs so the scan actually sees `Alpha.md`.
  const seeded = new NoteService(
    new NoteRepository(fs, new NoteParser()),
    new NoteProjection(index),
    new NoteQuery(index, new FtsQueryBuilder(new TokenizerParser()), new Ranker()),
  );

  const stats = await seeded.incrementalReindex(workspace());
  expect(stats).toEqual({ added: 1, updated: 0, removed: 0, total: 1 });
  expect(index.projected[0]?.documents).toHaveLength(1);
  expect(index.projected[0]?.documents[0]?.title).toBe("Injection Hook");
});

test("search delegates to the note query", async () => {
  const index = new SearchIndexFake();
  index.setNextHits([{ path: absPath("/kb/A.md"), title: "A", snippet: "…", score: -1 }]);
  index.setNextInlinks(new Map());

  const hits = await makeService(index).search(workspace(), "a", {
    limit: 5,
    linkBoost: 0.003,
  });
  expect(hits).toHaveLength(1);
});
