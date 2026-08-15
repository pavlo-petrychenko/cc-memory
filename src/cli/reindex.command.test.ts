import { describe, expect, test } from "bun:test";

import { ReindexCommand } from "@/cli/reindex.command.ts";
import { ReindexFormatter } from "@/cli/reindex.formatter.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { ResolveTargetWorkspacesUseCase } from "@/modules/workspace/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import {
  makeNoteModule,
  makeSearchIndex,
  makeWorklogModule,
} from "@/testing/fixtures/retrievalModules.fixture.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

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
  const container = makeTestGateways({ fs });
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);
  const workspace = makeWorkspaceContext(fs, makeGitFake(), makeProcFake());
  const command = new ReindexCommand(
    new ResolveTargetWorkspacesUseCase(
      workspace.repository,
      workspace.targetResolutionService,
    ),
    note.reprojectNotes,
    worklog.reprojectWorklog,
    new ReindexFormatter(),
  );
  return { command, fs, repository: workspace.repository };
}

describe("ReindexCommand", () => {
  test("reindexes a workspace and prints the +/~/- summary", async () => {
    const { command, fs, repository } = makeCommand();
    // SAFETY: a fixed literal test fixture path.
    fs.seedFile("/vault-primary/A.md" as AbsPath, "# A\nsome text\n");
    await repository.save(REGISTRY_PATH, [PRIMARY]);

    const result = await command.run(
      { workspace: "primary", full: false },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["primary: +1 ~0 -0 = 1 notes"]);
  });
});
