import { describe, expect, it } from "vitest";

import type { NoteFile } from "../../../server/vault.js";
import { buildKbTree, searchNotes } from "./vault.pure.js";

function makeNote(relPath: string, title: string, tags = "", type = "note"): NoteFile {
  return {
    absPath: `/tmp/${relPath}`,
    relPath,
    title,
    type,
    importance: null,
    tags,
    epic: "",
    body: `body of ${title}`,
    rels: [],
    mtimeMs: Date.now(),
  };
}

describe("buildKbTree", () => {
  it("builds dirs first then files sorted", () => {
    const notes = [
      makeNote("b/b.md", "B"),
      makeNote("a/a.md", "A"),
      makeNote("a/c.md", "C"),
    ];
    const tree = buildKbTree(notes);
    expect(tree.children?.[0]?.name).toBe("a");
    expect(tree.children?.[1]?.name).toBe("b");
  });

  it("marks isIndex for auth/auth.md", () => {
    const notes = [makeNote("auth/auth.md", "auth")];
    const tree = buildKbTree(notes);
    const authDir = tree.children?.find((c) => c.name === "auth");
    expect(authDir?.children?.[0]?.isIndex).toBe(true);
  });
});

describe("searchNotes", () => {
  it("scores title higher than body", () => {
    const notes = [
      makeNote("a/jwt.md", "JWT token", "auth"),
      makeNote("b/other.md", "Other", "", "note"),
    ];
    // body contains jwt in second note
    notes[1]!.body = "contains jwt";
    const hits = searchNotes(notes, "jwt", {});
    expect(hits[0]?.note.title).toBe("JWT token");
  });

  it("filters by tag", () => {
    const notes = [
      makeNote("a/one.md", "One", "jwt"),
      makeNote("a/two.md", "Two", "auth"),
    ];
    const hits = searchNotes(notes, "", { tag: "jwt" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.note.relPath).toBe("a/one.md");
  });

  it("returns empty when no query and no filters", () => {
    const notes = [makeNote("a/one.md", "One")];
    expect(searchNotes(notes, "", {})).toEqual([]);
  });

  it("caps at 50", () => {
    const notes = Array.from({ length: 60 }, (_, i) =>
      makeNote(`a/${i}.md`, `Note ${i}`),
    );
    const hits = searchNotes(notes, "Note", {});
    expect(hits.length).toBe(50);
  });
});
