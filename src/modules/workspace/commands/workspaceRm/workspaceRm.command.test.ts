import { describe, expect, test } from "bun:test";

import { WorkspaceRmCommand } from "@/modules/workspace/commands/workspaceRm/workspaceRm.command.ts";
import { WorkspaceRmFormatter } from "@/modules/workspace/commands/workspaceRm/workspaceRm.formatter.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { RemoveWorkspaceUseCase } from "@/modules/workspace/useCases/removeWorkspace.useCase.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

function makeCommand() {
  const fs = makeFsMemoryFake();
  const useCase = new RemoveWorkspaceUseCase(
    makeWorkspaceRepository(fs),
    new WorkspaceValidatorService(),
  );
  return new WorkspaceRmCommand(useCase, new WorkspaceRmFormatter());
}

describe("WorkspaceRmCommand", () => {
  test("parse requires an id", () => {
    expect(makeCommand().parse([])).toEqual({
      ok: false,
      error: { message: "workspace rm: missing <id>" },
    });
    expect(makeCommand().parse(["acme", "--purge"])).toEqual({
      ok: true,
      value: { id: "acme", purge: true },
    });
  });

  test("run reports an unknown workspace", async () => {
    const result = await makeCommand().run(
      { id: "ghost", purge: false },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderrMessage).toBe("no such workspace: ghost");
  });
});
