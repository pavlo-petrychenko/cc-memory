import { describe, expect, test } from "bun:test";

import { WorkspaceFormatter } from "@/modules/workspace/commands/workspace/workspace.formatter.ts";
import { WorkspaceLsCommand } from "@/modules/workspace/commands/workspaceLs.command.ts";
import { ListWorkspacesUseCase } from "@/modules/workspace/useCases/listWorkspaces.useCase.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/workspace.validator.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

const indexBuilder = { buildIndex: async () => 0, noteCount: async () => 0 };

function makeCommand() {
  const fs = makeFsMemoryFake();
  const useCase = new ListWorkspacesUseCase(
    makeWorkspaceRepository(fs),
    new WorkspaceValidatorService(),
    indexBuilder,
    new WorkspaceFormatter(),
  );
  return new WorkspaceLsCommand(useCase);
}

describe("WorkspaceLsCommand", () => {
  test("run reports no workspaces for an empty registry", async () => {
    const result = await makeCommand().run({}, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["(no workspaces)"]);
  });
});
