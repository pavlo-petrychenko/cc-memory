import { describe, expect, test } from "bun:test";

import { registerCommands } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { NotesCommand } from "@/modules/memory/index.ts";
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
  fs.seedFile(
    absPath("/vault-primary/Alpha.md"),
    "---\ntype: note\nimportance: 6\n---\n# Alpha\nbody\n",
  );
  const ctx = makeAppContext({ fs });
  const [handler] = registerCommands([NotesCommand], ctx);
  if (handler === undefined) throw new Error("expected one command handler");
  return { handler, ctx };
}

describe("NotesCommand", () => {
  test("--json prints the note list", async () => {
    const { handler, ctx } = makeHandler();
    await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

    const result = await handler.invoke(["--workspace", "primary", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.lines[0] ?? "")).toEqual([
      { path: "Alpha.md", title: "Alpha", type: "note", importance: 6 },
    ]);
  });
});
