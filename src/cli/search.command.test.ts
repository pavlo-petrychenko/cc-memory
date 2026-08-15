import { describe, expect, test } from "bun:test";

import { CliCommand, type SearchArgs } from "@/cli/index.ts";
import { SearchCommand } from "@/cli/search.command.ts";
import type { AbsPath } from "@/core/index.ts";
import { LogLevel } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { SearchFormatter } from "@/modules/note/index.ts";
import { expandWorkspace } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "@/testing/fakes/ioFake.fake.ts";
import {
  makeNoteModule,
  makeSearchIndex,
  makeWorklogModule,
} from "@/testing/fixtures/retrievalModules.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

// SAFETY: a fixed test fixture, matching the test container fixture's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
const CONFIG = {
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

type SeededFixture = {
  readonly container: Gateways;
  readonly io: IoFake;
  readonly command: SearchCommand;
};

async function seedIndexedWorkspace(): Promise<SeededFixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);

  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile(
    "/vault-primary/Kryptonite.md" as AbsPath,
    "# Kryptonite Handbook\nGeneral notes about assorted green minerals.\n",
  );
  await makeWorkspaceRepository(fs).save(REGISTRY_PATH, [PRIMARY]);
  await note.reprojectNotes.run(expandWorkspace(PRIMARY, HOME), { incremental: false });

  return {
    container,
    io,
    command: new SearchCommand(
      note.searchNotes,
      worklog.searchWorklog,
      new SearchFormatter(),
    ),
  };
}

describe("SearchCommand.execute", () => {
  test("prints a hit's title, relative path and snippet", async () => {
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "primary" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("• Kryptonite Handbook  (Kryptonite.md)");
    expect(io.written[1]).toContain("green minerals");
  });

  test("no hits prints '(no hits)'", async () => {
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "primary", query: "nonexistentterm" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no hits)"]);
  });

  test("an unknown --workspace fails with the exact 'no such workspace' message", async () => {
    const { container, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "ghost" }),
    );
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("no --workspace and a cwd under no workspace fails with the exact message", async () => {
    const { container, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(
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
