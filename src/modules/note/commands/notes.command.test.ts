import { describe, expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { NotesCommand } from "@/modules/note/commands/notes.command.ts";
import { ListNotesUseCase, NotesFormatter } from "@/modules/note/index.ts";
import { NoteParser } from "@/modules/note/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { ResolveWorkspaceUseCase } from "@/modules/workspace/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeGitFake } from "@/testing/fakes/gitFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function makeCommand() {
  const fs = makeFsMemoryFake();
  const workspace = makeWorkspaceContext(fs, makeGitFake(), makeProcFake());
  const command = new NotesCommand(
    new ResolveWorkspaceUseCase(workspace.repository, workspace.targetResolutionService),
    new ListNotesUseCase(new NoteRepository(fs, new NoteParser())),
    new NotesFormatter(),
  );
  return { command, fs, repository: workspace.repository };
}

describe("NotesCommand", () => {
  test("--json prints the note list", async () => {
    const { command, fs, repository } = makeCommand();
    // SAFETY: a fixed literal test fixture path.
    fs.seedFile(
      "/vault-primary/Alpha.md" as AbsPath,
      "---\ntype: note\nimportance: 6\n---\n# Alpha\nbody\n",
    );
    await repository.save(REGISTRY_PATH, [PRIMARY]);

    const result = await command.run(
      { workspace: "primary", cwd: null, folder: null, json: true },
      makeRunContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.lines[0] ?? "")).toEqual([
      { path: "Alpha.md", title: "Alpha", type: "note", importance: 6 },
    ]);
  });
});
