import { beforeEach, describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { SearchIndexAdapter } from "@/gateways/searchIndex/searchIndex.adapter.ts";
import {
  NOTES_SEARCH_TEMPLATE,
  SCHEMA,
  WEIGHTS_PLACEHOLDER,
  WORKLOG_SEARCH_TEMPLATE,
} from "@/gateways/searchIndex/searchIndex.constants.ts";
import { Collection } from "@/gateways/searchIndex/searchIndex.typedefs.ts";
import { SqliteAdapter } from "@/gateways/sqlite/sqlite.adapter.ts";
import { SCHEMA as OLD_SCHEMA } from "@/retrieval/store/schema/schema.constants.ts";
import { NOTES_SEARCH_SQL } from "@/retrieval/store/search/search.constants.ts";
import { WORKLOG_SEARCH_SQL } from "@/retrieval/store/search/search.constants.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

const NOTE_WEIGHTS = [10, 1, 5] as const;
const WORKLOG_WEIGHTS = [3, 1, 1] as const;

function workspace(): Workspace {
  return {
    id: "w",
    match: [absPath("/p")],
    kb: absPath("/kb"),
    worklogs: absPath("/kb/_Worklogs"),
    exclude: [],
    indexDb: absPath("/mem/w/index.db"),
    matchedPrefix: absPath("/p"),
  };
}

function renderNotes(weights: readonly number[]): string {
  return NOTES_SEARCH_TEMPLATE.replace(
    WEIGHTS_PLACEHOLDER,
    weights.map((weight) => weight.toFixed(1)).join(", "),
  );
}

function renderWorklog(weights: readonly number[]): string {
  return WORKLOG_SEARCH_TEMPLATE.replace(
    WEIGHTS_PLACEHOLDER,
    weights.map((weight) => weight.toFixed(1)).join(", "),
  );
}

function noteDocument(path: string, title: string) {
  return {
    path: absPath(path),
    title,
    body: "",
    tags: "",
    type: "note",
    importance: null,
    relations: [],
    slug: "",
    date: "",
    mtimeMs: 1,
  };
}

describe("SearchIndexAdapter", () => {
  let adapter: SearchIndexAdapter;

  beforeEach(() => {
    const handles = new Map<string, SqliteAdapter>();
    adapter = new SearchIndexAdapter(makeFsMemoryFake(), (path) => {
      const existing = handles.get(path);
      if (existing !== undefined) return existing;
      const db = new SqliteAdapter(":memory:");
      handles.set(path, db);
      return db;
    });
  });

  test("the schema and rendered query SQL are byte-identical to the pre-port text (C7)", () => {
    expect(SCHEMA).toBe(OLD_SCHEMA);
    expect(renderNotes([...NOTE_WEIGHTS])).toBe(NOTES_SEARCH_SQL);
    expect(renderWorklog([...WORKLOG_WEIGHTS])).toBe(WORKLOG_SEARCH_SQL);
  });

  test("resetIfStale reports a stale schema and rebuilds it", async () => {
    const ws = workspace();
    expect(await adapter.resetIfStale(ws)).toBe(true);
    // A second open sees the version the reset just wrote.
    expect(await adapter.resetIfStale(ws)).toBe(false);
  });

  test("project + query ranks a title hit above a body hit via bm25", async () => {
    const ws = workspace();
    await adapter.resetIfStale(ws);
    await adapter.project(ws, Collection.Notes, [
      {
        path: absPath("/kb/Beta/Title.md"),
        title: "Kryptonite Handbook",
        body: "assorted green minerals",
        tags: "",
        type: "note",
        importance: null,
        relations: [],
        slug: "",
        date: "",
        mtimeMs: 1,
      },
      {
        path: absPath("/kb/Beta/Body.md"),
        title: "Mineral Notes",
        body: "mentions kryptonite once",
        tags: "",
        type: "note",
        importance: null,
        relations: [],
        slug: "",
        date: "",
        mtimeMs: 1,
      },
    ]);

    const hits = await adapter.query(
      ws,
      Collection.Notes,
      '"kryptonite"',
      [...NOTE_WEIGHTS],
      5,
    );
    expect(hits.map((hit) => hit.path)).toEqual([
      absPath("/kb/Beta/Title.md"),
      absPath("/kb/Beta/Body.md"),
    ]);
  });

  test("prune deletes only the paths it was not told to keep", async () => {
    const ws = workspace();
    await adapter.resetIfStale(ws);
    const keepPath = absPath("/kb/keep.md");
    const dropPath = absPath("/kb/drop.md");
    await adapter.project(ws, Collection.Notes, [
      noteDocument(keepPath, "Keep"),
      noteDocument(dropPath, "Drop"),
    ]);

    await adapter.prune(ws, Collection.Notes, new Set([keepPath]));

    const hits = await adapter.query(
      ws,
      Collection.Notes,
      '"keep" OR "drop"',
      [...NOTE_WEIGHTS],
      10,
    );
    expect(hits.map((hit) => hit.path)).toEqual([absPath(keepPath)]);
  });

  test("worklog projection and query use slug/date/body columns", async () => {
    const ws = workspace();
    await adapter.resetIfStale(ws);
    await adapter.project(ws, Collection.Worklog, [
      {
        path: absPath("/kb/_Worklogs/wt1/2026-01-01.md"),
        title: "",
        body: "deployment rollback incident on the gateway",
        tags: "",
        type: "",
        importance: null,
        relations: [],
        slug: "wt1",
        date: "2026-01-01",
        mtimeMs: 1,
      },
    ]);

    const hits = await adapter.query(
      ws,
      Collection.Worklog,
      '"rollback"',
      [...WORKLOG_WEIGHTS],
      5,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("wt1");
  });

  test("neighbors counts in-candidate links by relKey and basename", async () => {
    const ws = workspace();
    await adapter.resetIfStale(ws);
    const source = absPath("/kb/A/Source.md");
    const target = absPath("/kb/A/Target.md");
    await adapter.project(ws, Collection.Notes, [
      {
        path: source,
        title: "Source",
        body: "[[A/Target]]",
        tags: "",
        type: "note",
        importance: null,
        relations: [{ relType: "links_to", dst: "A/Target" }],
        slug: "",
        date: "",
        mtimeMs: 1,
      },
      {
        path: target,
        title: "Target",
        body: "",
        tags: "",
        type: "note",
        importance: null,
        relations: [],
        slug: "",
        date: "",
        mtimeMs: 1,
      },
    ]);

    const inlinks = await adapter.neighbors(ws, [source, target]);
    expect(inlinks.get(target)).toBe(1);
    expect(inlinks.get(source)).toBe(0);
  });

  test("query swallows FTS5 syntax errors to []", async () => {
    const ws = workspace();
    await adapter.resetIfStale(ws);
    const hits = await adapter.query(
      ws,
      Collection.Notes,
      '"unterminated',
      [...NOTE_WEIGHTS],
      5,
    );
    expect(hits).toEqual([]);
  });
});
