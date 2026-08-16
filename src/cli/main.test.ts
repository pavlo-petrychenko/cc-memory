import { describe, expect, test } from "bun:test";

import { registerCommands, runCli } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { commands } from "@/registry.wiring.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: ["_Worklogs"],
  indexDb: ":memory:",
};

async function run(argv: readonly string[]) {
  const fs = makeFsMemoryFake();
  const ctx = makeAppContext({ fs });
  const handlers = registerCommands(commands, ctx);
  await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);
  return runCli(argv, handlers);
}

describe("runCli dispatch", () => {
  test("a parse failure maps to exit code 2 with the parser's message on stderr", async () => {
    const outcome = await run(["search"]);
    expect(outcome).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "search: missing <query>",
    });
  });

  test("resolve dispatches to the resolve command", async () => {
    const outcome = await run(["resolve", "--cwd", "/home/test/project"]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.lines[0]).toBe("workspace: primary");
  });

  test("--help lists the real command surface", async () => {
    const outcome = await run(["--help"]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.lines.join("\n")).toContain("memory search");
  });

  test("an unknown command exits 2", async () => {
    const outcome = await run(["frobnicate"]);
    expect(outcome).toEqual({
      lines: [],
      exitCode: 2,
      stderrMessage: "unknown command: frobnicate",
    });
  });
});
