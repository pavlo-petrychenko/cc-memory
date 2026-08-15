import { describe, expect, test } from "bun:test";

import { CliCommand, type SearchArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { LogLevel } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import {
  expandWorkspace,
  RegistryService,
  RegistryTomlSerializer,
} from "@/modules/workspace/index.ts";
import { SearchCommand } from "@/retrieval/commands/search/search.command.ts";
import { SearchFormatter } from "@/retrieval/commands/search/search.formatter.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { LinkGraphService } from "@/retrieval/store/graph/graph.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";
import { SearchService } from "@/retrieval/store/search/search.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

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

const connectionService = new IndexConnectionService(new SchemaService());
const indexBuildService = new IndexBuildService(connectionService);
const searchCommand = new SearchCommand(
  new SearchService(
    connectionService,
    new FtsQueryBuilder(new TokenizerParser()),
    new Ranker(),
    new LinkGraphService(connectionService),
  ),
  new SearchFormatter(),
);

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

type SeededFixture = { readonly container: Gateways; readonly io: IoFake };

async function seedIndexedWorkspace(): Promise<SeededFixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile(
    "/vault-primary/Kryptonite.md" as AbsPath,
    "# Kryptonite Handbook\nGeneral notes about assorted green minerals.\n",
  );
  await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
    PRIMARY,
  ]);
  await indexBuildService.build(container, expandWorkspace(PRIMARY, HOME));
  return { container, io };
}

describe("SearchCommand.execute", () => {
  test("prints a hit's title, relative path and snippet", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await searchCommand.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "primary" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("• Kryptonite Handbook  (Kryptonite.md)");
    expect(io.written[1]).toContain("green minerals");
  });

  test("no hits prints '(no hits)'", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await searchCommand.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "primary", query: "nonexistentterm" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no hits)"]);
  });

  test("an unknown --workspace fails with the exact 'no such workspace' message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await searchCommand.execute(
      container,
      CONFIG,
      searchArgs({ workspace: "ghost" }),
    );
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("no --workspace and a cwd under no workspace fails with the exact message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await searchCommand.execute(
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
