import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import { NoteListService } from "@/retrieval/store/noteList/noteList.service.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";
import {
  setupIndexFixture,
  teardownIndexFixture,
  type IndexFixture,
} from "@/testing/fixtures/retrievalIndex.fixture.ts";

// The 8-note corpus (the vault fixture's PRIMARY_NOTES) — kept here so
// "exhaustive" is asserted against a named set, not just a count.
const ALL_NOTE_PATHS = [
  "Alpha/Alpha.md",
  "Alpha/Injection Hook.md",
  "Alpha/Search Ranking.md",
  "Alpha/Scoring Camel.md",
  "Beta/Title Kryptonite.md",
  "Beta/Body Kryptonite.md",
  "Gamma/Adjacent.md",
  "Gamma/Apart.md",
] as const;

const connectionService = new IndexConnectionService(new SchemaService());
const indexBuildService = new IndexBuildService(connectionService);
const noteListService = new NoteListService(connectionService);

let fixture: IndexFixture;

beforeEach(async () => {
  fixture = setupIndexFixture();
  await indexBuildService.build(fixture.container, fixture.primary, {
    incremental: false,
  });
});

afterEach(() => {
  teardownIndexFixture(fixture);
});

describe("index/notes NoteListService.list", () => {
  test("with no folder, enumerates every indexed note, `.md` extension kept", async () => {
    const all = await noteListService.list(fixture.container, fixture.primary);
    expect(new Set(all.map((note) => note.path))).toEqual(new Set(ALL_NOTE_PATHS));
  });

  test("with a folder, only that folder's notes come back", async () => {
    const alpha = await noteListService.list(fixture.container, fixture.primary, "Alpha");

    expect(alpha.length).toBeGreaterThan(0);
    expect(alpha.every((note) => note.path.startsWith("Alpha/"))).toBe(true);
    expect(alpha.map((note) => note.path)).not.toContain("Beta/Body Kryptonite.md");

    const index = alpha.find((note) => note.path === "Alpha/Alpha.md");
    expect(index?.type).toBe("index");
    const hook = alpha.find((note) => note.path === "Alpha/Injection Hook.md");
    expect(hook?.importance).toBe(6);
  });

  test("an empty folder string behaves like no folder at all", async () => {
    const all = await noteListService.list(fixture.container, fixture.primary, "");
    expect(all.length).toBe(ALL_NOTE_PATHS.length);
  });

  test("a folder with no matching notes returns an empty list", async () => {
    const none = await noteListService.list(
      fixture.container,
      fixture.primary,
      "Nonexistent",
    );
    expect(none).toEqual([]);
  });

  test("results are sorted by path", async () => {
    const all = await noteListService.list(fixture.container, fixture.primary);
    const paths = all.map((note) => note.path);
    expect(paths).toEqual([...paths].toSorted());
  });

  test("a workspace never sees another workspace's notes", async () => {
    await indexBuildService.build(fixture.container, fixture.secondary, {
      incremental: false,
    });
    const secondaryNotes = await noteListService.list(
      fixture.container,
      fixture.secondary,
    );
    expect(secondaryNotes.map((note) => note.path)).toEqual(["Widgets/Widget Guide.md"]);
  });
});
