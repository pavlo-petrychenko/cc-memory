import { describe, expect, test } from "bun:test";

import { CliCommand, type ReindexArgs } from "../cli/args.ts";
import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { RawWorkspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { makeFsMemoryFake } from "../testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "../testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "../testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "../workspace/registry.service.ts";
import { reindex } from "./reindex.command.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

// A registered workspace whose `index_db` is bun:sqlite's OWN in-memory
// identifier, not a derived real path — the same `IN_MEMORY_DB` convention
// `tests/integration/retrieval/build.test.ts` uses, satisfying "never
// fake SqlDatabase" (CLAUDE.md) without touching the real filesystem.
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
  readonly container: Container;
  readonly io: { readonly written: readonly string[] };
}> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestContainer({ stdio: io, fs });
  // SAFETY: a fixed literal filename joined onto a fixed literal directory
  // string, both hard-coded test fixtures.
  fs.seedFile("/vault-primary/A.md" as AbsPath, "# A\nsome text\n");
  await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
  return { container, io };
}

describe("reindex", () => {
  test("reindexes a single workspace and prints the +/~/- summary", async () => {
    const { container, io } = await seedRegistry();

    const outcome = await reindex(container, reindexArgs({ workspace: "primary" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: +1 ~0 -0 = 1 notes"]);
  });

  test("an unknown workspace fails with the exact 'no such workspace' message", async () => {
    const { container } = await seedRegistry();

    const outcome = await reindex(container, reindexArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
