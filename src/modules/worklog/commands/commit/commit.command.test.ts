import { describe, expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { CommitCommand } from "@/modules/worklog/commands/commit/commit.command.ts";
import { CommitFormatter } from "@/modules/worklog/commands/commit/commit.formatter.ts";
import { ResolveTargetWorkspacesUseCase } from "@/modules/workspace/index.ts";
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
  const command = new CommitCommand(
    fs,
    makeProcFake(),
    new ResolveTargetWorkspacesUseCase(
      workspace.repository,
      workspace.targetResolutionService,
    ),
    new CommitFormatter(),
  );
  return { command, repository: workspace.repository };
}

describe("CommitCommand", () => {
  test("parse reads an optional workspace and message", () => {
    const { command } = makeCommand();
    expect(command.parse(["primary", "-m", "msg"])).toEqual({
      ok: true,
      value: { workspace: "primary", message: "msg" },
    });
  });

  test("run skips a kb that is not a git repo", async () => {
    const { command, repository } = makeCommand();
    await repository.save(REGISTRY_PATH, [PRIMARY]);

    const result = await command.run(
      { workspace: "primary", message: "x" },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["primary: not a git repo, skipping"]);
  });
});
