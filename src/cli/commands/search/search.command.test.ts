import { describe, expect, test } from "bun:test";

import { SearchCommand } from "@/cli/commands/search/search.command.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import {
  NoteQuery,
  SearchNotesUseCase,
  SearchHitFormatter,
} from "@/modules/note/index.ts";
import { SearchWorklogUseCase, WorklogQuery } from "@/modules/worklog/index.ts";
import { ResolveWorkspaceUseCase } from "@/modules/workspace/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function makeCommand() {
  const fs = makeFsMemoryFake();
  const workspace = makeWorkspaceContext(fs, makeGitFake(), makeProcFake());
  const tokenizer = new TokenizerParser();
  const index = new SearchIndexFake();
  index.setNextHits([
    {
      path: absPath("/vault-primary/Kryptonite.md"),
      title: "Kryptonite",
      snippet: "…",
      score: -1,
    },
  ]);
  index.setNextInlinks(new Map());
  const searchNotes = new SearchNotesUseCase(
    new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker()),
  );
  const searchWorklog = new SearchWorklogUseCase(
    new WorklogQuery(index, new FtsQueryBuilder(tokenizer), new Ranker()),
  );
  const command = new SearchCommand(
    new ResolveWorkspaceUseCase(workspace.repository, workspace.targetResolutionService),
    searchNotes,
    searchWorklog,
    new SearchHitFormatter(),
  );
  return { command, repository: workspace.repository };
}

describe("SearchCommand", () => {
  test("parse requires a query", () => {
    const { command } = makeCommand();
    expect(command.parse([])).toEqual({
      ok: false,
      error: { message: "search: missing <query>" },
    });
  });

  test("run prints a hit's title, path and snippet", async () => {
    const { command, repository } = makeCommand();
    await repository.save(REGISTRY_PATH, [PRIMARY]);

    const result = await command.run(
      { query: "kryptonite", workspace: "primary", cwd: null, limit: 5, worklog: false },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("• Kryptonite  (Kryptonite.md)");
  });
});
