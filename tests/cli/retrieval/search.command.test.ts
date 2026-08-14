import { describe, expect, test } from "bun:test";

import { CliCommand, type SearchArgs } from "../../../src/cli/args.ts";
import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { LogLevel } from "../../../src/core/Config.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { RawWorkspace } from "../../../src/core/Workspace.ts";
import type { Container } from "../../../src/platform/container.ts";
import { buildIndex } from "../../../src/retrieval/build.service.ts";
import { search } from "../../../src/retrieval/search.command.ts";
import {
  expandWorkspace,
  saveRegistry,
} from "../../../src/workspace/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "../../helpers/fakes/ioFake.fake.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
const CONFIG = {
  injectMinScore: 0.2,
  linkBoost: 0.003,
  injectLogEnabled: true,
  blockAfter: 2,
  blockDrift: 5,
  gateDisabled: false,
  consolidateCmd: "claude --dangerously-skip-permissions",
  logLevel: LogLevel.Warn,
};

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function searchArgs(overrides: Partial<SearchArgs> = {}): SearchArgs {
  return {
    command: CliCommand.Search,
    query: "kryptonite",
    workspace: null,
    cwd: null,
    limit: 5,
    worklog: false,
    ...overrides,
  };
}

type SeededFixture = { readonly container: Container; readonly io: IoFake };

async function seedIndexedWorkspace(): Promise<SeededFixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestContainer({ stdio: io, fs });
  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile(
    "/vault-primary/Kryptonite.md" as AbsPath,
    "# Kryptonite Handbook\nGeneral notes about assorted green minerals.\n",
  );
  await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
  await buildIndex(container, expandWorkspace(PRIMARY, HOME));
  return { container, io };
}

describe("search (cmd_search, bin/memory:139-152)", () => {
  test("prints a hit's title, relative path and snippet", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await search(container, CONFIG, searchArgs({ workspace: "primary" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("• Kryptonite Handbook  (Kryptonite.md)");
    expect(io.written[1]).toContain("green minerals");
  });

  test("no hits prints '(no hits)'", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await search(
      container,
      CONFIG,
      searchArgs({ workspace: "primary", query: "nonexistentterm" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no hits)"]);
  });

  test("an unknown --workspace fails with bin/memory:141's exact message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await search(container, CONFIG, searchArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("no --workspace and a cwd under no workspace fails with bin/memory:145's exact message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await search(
      container,
      CONFIG,
      searchArgs({ cwd: "/nowhere/under/any/workspace" }),
    );
    expect(outcome).toEqual({
      exitCode: 1,
      stderrMessage: "no workspace for cwd; pass --workspace",
    });
  });
});
