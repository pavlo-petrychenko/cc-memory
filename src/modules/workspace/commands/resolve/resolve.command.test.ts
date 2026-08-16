import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { ResolveCommand } from "@/modules/workspace/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

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

function makeHandler() {
  const ctx = makeAppContext({ fs: makeFsMemoryFake() });
  const [handler] = registerCommands([ResolveCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("ResolveCommand", () => {
  test("prints workspace + slug for a cwd inside a workspace", async () => {
    const { handler, ctx } = makeHandler();
    await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

    const result = await handler.invoke(["/repo/primary"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("workspace: primary");
    expect(result.lines[1]).toContain("slug:");
  });

  test("no match prints a message and exits 0", async () => {
    const { handler } = makeHandler();
    const result = await handler.invoke(["/nowhere"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual(["no workspace for /nowhere"]);
  });
});
