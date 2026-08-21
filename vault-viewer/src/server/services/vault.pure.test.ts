import { describe, expect, it } from "vitest";

import type { NoteFile } from "../../../server/vault.js";
import {
  buildGraphEdges,
  buildKbTree,
  computeBacklinks,
  searchNotes,
  subgraph,
} from "./vault.pure.js";

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

// -- computeBacklinks

describe("computeBacklinks", () => {
  function noteWithRels(
    relPath: string,
    title: string,
    targets: string[],
    body = "x",
  ): NoteFile {
    const n = makeNote(relPath, title);
    n.body = body;
    n.rels = targets.map((target) => ({ relationType: "rel", target }));
    return n;
  }

  it("matches by path without extension", () => {
    const notes = [noteWithRels("a/one.md", "One", ["b/two"])];
    const links = computeBacklinks(notes, "b/two.md", "Two", "two");
    expect(links.map((l) => l.relPath)).toEqual(["a/one.md"]);
  });

  it("matches by title", () => {
    const notes = [noteWithRels("a/one.md", "One", ["Two"])];
    const links = computeBacklinks(notes, "b/two.md", "Two", "two");
    expect(links).toHaveLength(1);
  });

  it("excludes the note itself and stops at first matching relation", () => {
    const notes = [noteWithRels("b/two.md", "Two", ["Two"])];
    expect(computeBacklinks(notes, "b/two.md", "Two", "two")).toEqual([]);
  });

  it("snippets around the [[link]] when present", () => {
    const notes = [noteWithRels("a/one.md", "One", ["b/two"], "before [[b/two]] after")];
    const links = computeBacklinks(notes, "b/two.md", "Two", "two");
    expect(links[0]?.snippet).toContain("[[b/two]]");
  });
});

// -- buildGraphEdges / subgraph

describe("buildGraphEdges", () => {
  it("resolves target.md then bare relPath then title", () => {
    const a = makeNote("a.md", "A");
    a.rels = [
      { relationType: "rel", target: "b" },
      { relationType: "rel", target: "c" },
      { relationType: "rel", target: "Dee" },
      { relationType: "rel", target: "missing" },
    ];
    const b = makeNote("b.md", "B");
    const c = makeNote("dir/c.md", "C");
    const d = makeNote("d.md", "Dee");
    const edges = buildGraphEdges([a, b, c, d]);
    expect(edges).toEqual([
      { source: "a.md", target: "b.md", relationType: "rel" },
      { source: "a.md", target: "dir/c.md", relationType: "rel" },
      { source: "a.md", target: "d.md", relationType: "rel" },
    ]);
  });
});

describe("subgraph", () => {
  const a = makeNote("a.md", "A");
  const b = makeNote("b.md", "B");
  const c = makeNote("c.md", "C");
  const notes = [a, b, c];
  const edges = [
    { source: "a.md", target: "b.md", relationType: "rel" },
    { source: "c.md", target: "z.md", relationType: "rel" },
  ];

  it("full mode caps nodes and keeps only visible edges", () => {
    const g = subgraph(notes, edges, null, 1, true);
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toEqual([{ source: "a.md", target: "b.md", relationType: "rel" }]);
  });

  it("focus mode expands BFS to depth hops bidirectionally", () => {
    const g = subgraph(notes, edges, "b.md", 1, false);
    expect(g.nodes.map((n) => n.relPath).toSorted()).toEqual(["a.md", "b.md"]);
    expect(g.edges).toHaveLength(1);
  });

  it("focus mode with depth 0 keeps only the focus node", () => {
    const g = subgraph(notes, edges, "b.md", 0, false);
    expect(g.nodes.map((n) => n.relPath)).toEqual(["b.md"]);
    expect(g.edges).toEqual([]);
  });
});
