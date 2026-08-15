import { describe, expect, test } from "bun:test";

import { runCli } from "@/cli/main.ts";
import { absPath, expandPath } from "@/core/index.ts";
import { LogLevel } from "@/core/index.ts";
import type { Config, RawWorkspace } from "@/core/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const CONFIG: Config = {
  injectMinScore: 0.2,
  linkBoost: 0.003,
  injectLogEnabled: true,
  blockAfter: 2,
  blockDrift: 5,
  gateDisabled: false,
  logLevel: LogLevel.Warn,
};

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: ["_Worklogs"],
  indexDb: ":memory:",
};

async function run(argv: readonly string[]) {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs, proc: makeProcFake() });
  await makeWorkspaceRepository(fs).save(REGISTRY_PATH, [PRIMARY]);
  const outcome = await runCli(argv, container, CONFIG);
  return { outcome, io };
}

describe("runCli dispatch", () => {
  test("a parse failure maps to exit code 2 with the parser's message on stderr", async () => {
    const { outcome } = await run(["search"]);
    expect(outcome).toEqual({ exitCode: 2, stderrMessage: "search: missing <query>" });
  });

  test("resolve dispatches to the resolve command", async () => {
    const { outcome, io } = await run(["resolve", "--cwd", "/home/test/project"]);
    expect(outcome.exitCode).toBe(0);
    expect(io.written[0]).toBe("workspace: primary");
  });

  test("--help lists the real command surface", async () => {
    const { outcome, io } = await run(["--help"]);
    expect(outcome.exitCode).toBe(0);
    expect(io.written.join("\n")).toContain("memory search");
  });

  test("an unknown command exits 2", async () => {
    const { outcome } = await run(["frobnicate"]);
    expect(outcome).toEqual({
      exitCode: 2,
      stderrMessage: "unknown command: frobnicate",
    });
  });
});
