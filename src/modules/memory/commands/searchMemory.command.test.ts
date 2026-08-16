import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { SearchCommand } from "@/modules/memory/index.ts";
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
  const ctx = makeAppContext({ fs }, index);
  const [handler] = registerCommands([SearchCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("SearchCommand", () => {
  test("parse requires a query", async () => {
    const { handler } = makeHandler();
    const result = await handler.invoke([]);
    expect(result).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "search: missing <query>",
    });
  });

  test("run prints a hit's title, path and snippet", async () => {
    const { handler, ctx } = makeHandler();
    await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

    const result = await handler.invoke(["kryptonite", "--workspace", "primary"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("• Kryptonite  (Kryptonite.md)");
  });
});
