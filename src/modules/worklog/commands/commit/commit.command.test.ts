import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { CommitCommand } from "@/modules/worklog/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function makeHandler() {
  const ctx = makeAppContext({ fs: makeFsMemoryFake() });
  const [handler] = registerCommands([CommitCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("CommitCommand", () => {
  test("run skips a kb that is not a git repo", async () => {
    const { handler, ctx } = makeHandler();
    await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

    const result = await handler.invoke(["primary", "-m", "x"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["primary: not a git repo, skipping"]);
  });
});
