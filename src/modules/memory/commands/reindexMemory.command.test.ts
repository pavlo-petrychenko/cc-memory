import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { ReindexCommand } from "@/modules/memory/index.ts";
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
  const fs = makeFsMemoryFake();
  fs.seedFile(absPath("/vault-primary/A.md"), "# A\nsome text\n");
  const index = new SearchIndexFake();
  const ctx = makeAppContext({ fs }, index);
  const [handler] = registerCommands([ReindexCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("ReindexCommand", () => {
  test("reindexes a workspace and prints the +/~/- summary", async () => {
    const { handler, ctx } = makeHandler();
    await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

    const result = await handler.invoke(["primary"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["primary: +1 ~0 -0 = 1 notes"]);
  });
});
