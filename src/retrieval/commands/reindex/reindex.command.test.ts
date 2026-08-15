import { describe, expect, test } from "bun:test";

import { CliCommand, type ReindexArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { ReindexCommand } from "@/retrieval/commands/reindex/reindex.command.ts";
import { ReindexFormatter } from "@/retrieval/commands/reindex/reindex.formatter.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import { RegistryService, RegistryTomlSerializer } from "@/workspace/index.ts";

// SAFETY: a fixed test fixture, matching the test container fixture's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

// A registered workspace whose `index_db` is bun:sqlite's OWN in-memory
// identifier, not a derived real path — the same `IN_MEMORY_DB` convention
// used across the retrieval store's tests, satisfying "never
// fake Sqlite" (CLAUDE.md) without touching the real filesystem.
const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

const reindexCommand = new ReindexCommand(
  new IndexBuildService(new IndexConnectionService(new SchemaService())),
  new ReindexFormatter(),
);

function reindexArgs(overrides: Partial<ReindexArgs> = {}): ReindexArgs {
  return { command: CliCommand.Reindex, workspace: null, full: false, ...overrides };
}

async function seedRegistry(): Promise<{
  readonly container: Gateways;
  readonly io: { readonly written: readonly string[] };
}> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile("/vault-primary/A.md" as AbsPath, "# A\nsome text\n");
  await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
    PRIMARY,
  ]);
  return { container, io };
}

describe("ReindexCommand.execute", () => {
  test("reindexes a single workspace and prints the +/~/- summary", async () => {
    const { container, io } = await seedRegistry();

    const outcome = await reindexCommand.execute(
      container,
      reindexArgs({ workspace: "primary" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: +1 ~0 -0 = 1 notes"]);
  });

  test("an unknown workspace fails with the exact 'no such workspace' message", async () => {
    const { container } = await seedRegistry();

    const outcome = await reindexCommand.execute(
      container,
      reindexArgs({ workspace: "ghost" }),
    );
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
