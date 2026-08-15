import { describe, expect, test } from "bun:test";

import { CliCommand, type ReindexArgs } from "@/cli/index.ts";
import { ReindexCommand } from "@/cli/reindex.command.ts";
import { ReindexFormatter } from "@/cli/reindex.formatter.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
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

// A registered workspace whose `index_db` is bun:sqlite's OWN in-memory
// identifier — satisfying "never fake Sqlite" (CLAUDE.md) without touching the
// real filesystem.
const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function reindexArgs(overrides: Partial<ReindexArgs> = {}): ReindexArgs {
  return { command: CliCommand.Reindex, workspace: null, full: false, ...overrides };
}

async function seedRegistry(): Promise<{
  readonly container: Gateways;
  readonly io: { readonly written: readonly string[] };
  readonly command: ReindexCommand;
}> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);
  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile("/vault-primary/A.md" as AbsPath, "# A\nsome text\n");
  await makeWorkspaceRepository(fs).save(REGISTRY_PATH, [PRIMARY]);
  return {
    container,
    io,
    command: new ReindexCommand(
      note.reprojectNotes,
      worklog.reprojectWorklog,
      new ReindexFormatter(),
    ),
  };
}

describe("ReindexCommand.execute", () => {
  test("reindexes a single workspace and prints the +/~/- summary", async () => {
    const { container, io, command } = await seedRegistry();

    const outcome = await command.execute(
      container,
      reindexArgs({ workspace: "primary" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: +1 ~0 -0 = 1 notes"]);
  });

  test("an unknown workspace fails with the exact 'no such workspace' message", async () => {
    const { container, command } = await seedRegistry();

    const outcome = await command.execute(container, reindexArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
