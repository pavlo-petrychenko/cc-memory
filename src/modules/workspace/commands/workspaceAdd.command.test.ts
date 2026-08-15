import { describe, expect, test } from "bun:test";

import { WorkspaceFormatter } from "@/modules/workspace/commands/workspace/workspace.formatter.ts";
import { WorkspaceAddCommand } from "@/modules/workspace/commands/workspaceAdd.command.ts";
import { AddWorkspaceUseCase } from "@/modules/workspace/useCases/addWorkspace.useCase.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/workspace.validator.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

const indexBuilder = {
  buildIndex: async () => 1,
  noteCount: async () => 1,
};

function makeCommand() {
  const fs = makeFsMemoryFake();
  const useCase = new AddWorkspaceUseCase(
    makeWorkspaceRepository(fs),
    new WorkspaceValidatorService(),
    indexBuilder,
  );
  return new WorkspaceAddCommand(useCase, new WorkspaceFormatter());
}

describe("WorkspaceAddCommand", () => {
  test("parse requires an id and --match", () => {
    expect(makeCommand().parse([])).toEqual({
      ok: false,
      error: { message: "workspace add: missing <id>" },
    });
    expect(makeCommand().parse(["acme"])).toEqual({
      ok: false,
      error: { message: "workspace add: --match requires at least one path" },
    });
    expect(makeCommand().parse(["acme", "--match", "/repo"]).ok).toBe(true);
  });

  test("run registers the workspace and prints the added lines", async () => {
    const result = await makeCommand().run(
      { id: "acme", match: ["/repo"], kb: null, worklogs: null, exclude: null },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("✓ workspace 'acme' added");
  });
});
