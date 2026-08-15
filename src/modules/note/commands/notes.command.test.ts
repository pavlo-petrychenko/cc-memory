import { describe, expect, test } from "bun:test";

import { CliCommand, type NotesArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { NotesCommand } from "@/modules/note/commands/notes.command.ts";
import { ListNotesUseCase } from "@/modules/note/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { NotesFormatter } from "@/modules/note/services/notes.formatter.ts";
import { RegistryService, RegistryTomlSerializer } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

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

type SeededFixture = {
  readonly container: Gateways;
  readonly io: IoFake;
  readonly command: NotesCommand;
};

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
  return {
    container,
    io,
    command: new NotesCommand(
      new ListNotesUseCase(new NoteRepository(fs, new NoteParser())),
      new NotesFormatter(),
    ),
  };
}

describe("NotesCommand.execute", () => {
  test("--json prints JSON.stringify(rows, null, 2), path/title/type/importance in order", async () => {
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(container, notesArgs({ json: true }));
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
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(container, notesArgs());
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual([
      "[ 6] note   Alpha/Injection Hook.md  — Injection Hook",
      "[ -] note   Loose.md  — Loose",
    ]);
  });

  test("--folder restricts to a folder prefix", async () => {
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(container, notesArgs({ folder: "Alpha" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["[ 6] note   Alpha/Injection Hook.md  — Injection Hook"]);
  });

  test("no notes under an unmatched folder prints the exact (no notes) fallback", async () => {
    const { container, io, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(container, notesArgs({ folder: "Ghost" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no notes) under Ghost"]);
  });

  test("an unknown --workspace fails with the exact 'no such workspace' message", async () => {
    const { container, command } = await seedIndexedWorkspace();

    const outcome = await command.execute(container, notesArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
