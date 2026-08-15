import { describe, expect, test } from "bun:test";

import { CliCommand, type NotesArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { NotesCommand } from "@/retrieval/commands/notes/notes.command.ts";
import { NotesFormatter } from "@/retrieval/commands/notes/notes.formatter.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import { NoteListService } from "@/retrieval/store/noteList/noteList.service.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import {
  expandWorkspace,
  RegistryService,
  RegistryTomlSerializer,
} from "@/workspace/index.ts";

// SAFETY: a fixed test fixture, matching the test container fixture's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

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
const notesCommand = new NotesCommand(
  new NoteListService(connectionService),
  new NotesFormatter(),
);

function notesArgs(overrides: Partial<NotesArgs> = {}): NotesArgs {
  return {
    command: CliCommand.Notes,
    workspace: "primary",
    cwd: null,
    folder: null,
    json: false,
    ...overrides,
  };
}

type SeededFixture = { readonly container: Gateways; readonly io: IoFake };

async function seedIndexedWorkspace(): Promise<SeededFixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestGateways({ stdio: io, fs });
  // SAFETY: fixed literal test fixture paths.
  fs.seedFile(
    "/vault-primary/Alpha/Injection Hook.md" as AbsPath,
    "---\ntype: note\nimportance: 6\n---\n# Injection Hook\nSome body text.\n",
  );
  // SAFETY: fixed literal test fixture paths.
  fs.seedFile("/vault-primary/Loose.md" as AbsPath, "# Loose\nNo frontmatter.\n");
  await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
    PRIMARY,
  ]);
  await indexBuildService.build(container, expandWorkspace(PRIMARY, HOME));
  return { container, io };
}

describe("NotesCommand.execute", () => {
  test("--json prints JSON.stringify(rows, null, 2), path/title/type/importance in order", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notesCommand.execute(container, notesArgs({ json: true }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    const parsed: unknown = JSON.parse(io.written.join(""));
    expect(parsed).toEqual([
      {
        path: "Alpha/Injection Hook.md",
        title: "Injection Hook",
        type: "note",
        importance: 6,
      },
      { path: "Loose.md", title: "Loose", type: "note", importance: null },
    ]);
  });

  test("plain listing pads importance and type", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notesCommand.execute(container, notesArgs());
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual([
      "[ 6] note   Alpha/Injection Hook.md  — Injection Hook",
      "[ -] note   Loose.md  — Loose",
    ]);
  });

  test("--folder restricts to a folder prefix", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notesCommand.execute(container, notesArgs({ folder: "Alpha" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["[ 6] note   Alpha/Injection Hook.md  — Injection Hook"]);
  });

  test("no notes under an unmatched folder prints the exact (no notes) fallback", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notesCommand.execute(container, notesArgs({ folder: "Ghost" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no notes) under Ghost"]);
  });

  test("an unknown --workspace fails with the exact 'no such workspace' message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await notesCommand.execute(
      container,
      notesArgs({ workspace: "ghost" }),
    );
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
