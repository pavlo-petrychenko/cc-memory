import { describe, expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { ResolveCommand } from "@/modules/workspace/commands/resolve/resolve.command.ts";
import { ResolveFormatter } from "@/modules/workspace/commands/resolve/resolve.formatter.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

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
  const repository = makeWorkspaceRepository(fs);
  return {
    command: new ResolveCommand(
      repository,
      new WorkspaceResolverService(new WorkspaceValidatorService()),
      new ResolveFormatter(),
    ),
    fs,
    repository,
  };
}

describe("ResolveCommand", () => {
  test("prints workspace + slug for a cwd inside a workspace", async () => {
    const { command, fs, repository } = makeCommand();
    await repository.save(REGISTRY_PATH, [PRIMARY]);
    void fs;

    const result = await command.run({ cwd: "/repo/primary" }, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("workspace: primary");
    expect(result.lines[1]).toContain("slug:");
  });

  test("no match prints a message and exits 0", async () => {
    const { command } = makeCommand();
    const result = await command.run({ cwd: "/nowhere" }, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["no workspace for /nowhere"]);
  });
});
