import { describe, expect, test } from "bun:test";

import { CliCommand, type NotesArgs } from "../../../src/cli/args.ts";
import { notes } from "../../../src/cli/commands/notes.command.ts";
import type { Container } from "../../../src/container.ts";
import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../src/domain/paths.ts";
import type { RawWorkspace } from "../../../src/domain/Workspace.ts";
import { buildIndex } from "../../../src/services/index/build.ts";
import { expandWorkspace, saveRegistry } from "../../../src/services/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeIoFake, type IoFake } from "../../helpers/fakes/ioFake.fake.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
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

type SeededFixture = { readonly container: Container; readonly io: IoFake };

async function seedIndexedWorkspace(): Promise<SeededFixture> {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestContainer({ stdio: io, fs });
  // SAFETY: fixed literal test fixture paths.
  fs.seedFile(
    "/vault-primary/Alpha/Injection Hook.md" as AbsPath,
    "---\ntype: note\nimportance: 6\n---\n# Injection Hook\nSome body text.\n",
  );
  // SAFETY: fixed literal test fixture paths.
  fs.seedFile("/vault-primary/Loose.md" as AbsPath, "# Loose\nNo frontmatter.\n");
  await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
  await buildIndex(container, expandWorkspace(PRIMARY, HOME));
  return { container, io };
}

describe("notes (cmd_notes, bin/memory:165-176)", () => {
  test("--json prints JSON.stringify(rows, null, 2), path/title/type/importance in order", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notes(container, notesArgs({ json: true }));
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

  test("plain listing pads importance and type per bin/memory:176", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notes(container, notesArgs());
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual([
      "[ 6] note   Alpha/Injection Hook.md  — Injection Hook",
      "[ -] note   Loose.md  — Loose",
    ]);
  });

  test("--folder restricts to a folder prefix", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notes(container, notesArgs({ folder: "Alpha" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["[ 6] note   Alpha/Injection Hook.md  — Injection Hook"]);
  });

  test("no notes under an unmatched folder prints the exact (no notes) fallback", async () => {
    const { container, io } = await seedIndexedWorkspace();

    const outcome = await notes(container, notesArgs({ folder: "Ghost" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no notes) under Ghost"]);
  });

  test("an unknown --workspace fails with the exact bin/memory message", async () => {
    const { container } = await seedIndexedWorkspace();

    const outcome = await notes(container, notesArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
