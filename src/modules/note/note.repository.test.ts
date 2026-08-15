import { describe, expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { NoteRepository } from "@/modules/note/note.repository.ts";
import { NoteParser } from "@/modules/note/services/note.parser.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

function workspace(): Workspace {
  return {
    id: "w",
    match: [absPath("/repo")],
    kb: absPath("/kb"),
    worklogs: absPath("/kb/_Worklogs"),
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: absPath("/mem/w/index.db"),
    matchedPrefix: absPath("/repo"),
  };
}

const NOTE_TEXT = `---
type: note
importance: 6
---
# Injection Hook
The hook extracts salient tokens.
`;

describe("NoteRepository", () => {
  test("list returns notes sorted by kb-relative path, reading markdown directly", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(expandPath("/kb/Beta/Body.md", absPath("/")), NOTE_TEXT);
    fs.seedFile(expandPath("/kb/Alpha/Injection Hook.md", absPath("/")), NOTE_TEXT);
    const repository = new NoteRepository(fs, new NoteParser());

    const summaries = await repository.list(workspace());
    expect(summaries.map((summary) => summary.path)).toEqual([
      "Alpha/Injection Hook.md",
      "Beta/Body.md",
    ]);
    expect(summaries[0]?.title).toBe("Injection Hook");
    expect(summaries[0]?.importance).toBe(6);
  });

  test("count is the number of scanned markdown files", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(expandPath("/kb/A.md", absPath("/")), NOTE_TEXT);
    fs.seedFile(expandPath("/kb/B.md", absPath("/")), NOTE_TEXT);
    const repository = new NoteRepository(fs, new NoteParser());
    expect(await repository.count(workspace())).toBe(2);
  });

  test("readNote returns null for a missing file", async () => {
    const repository = new NoteRepository(makeFsMemoryFake(), new NoteParser());
    expect(await repository.readNote(workspace(), absPath("/kb/missing.md"))).toBeNull();
  });
});
