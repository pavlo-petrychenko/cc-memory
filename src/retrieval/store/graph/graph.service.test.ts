import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { LinkGraphService } from "@/retrieval/store/graph/graph.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/index.ts";
import {
  setupIndexFixture,
  teardownIndexFixture,
  type IndexFixture,
} from "@/testing/fixtures/retrievalIndex.fixture.ts";

const indexBuildService = new IndexBuildService();
const linkGraphService = new LinkGraphService();

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

function underKb(relativePath: string): AbsPath {
  // SAFETY: `relativePath` is one of the fixed corpus's own relative paths,
  // joined onto the already-absolute, already-normalized `kb` root — the
  // result is always an absolute, normalized path.
  return `${fixture.primary.kb}/${relativePath}` as AbsPath;
}

describe("index/graph LinkGraphService.inlinkCounts", () => {
  test("a note depends_on'd by another gets an in-link; the linker gets none", async () => {
    const injectionHook = underKb("Alpha/Injection Hook.md");
    const searchRanking = underKb("Alpha/Search Ranking.md");

    const inDegree = await linkGraphService.inlinkCounts(
      fixture.container,
      fixture.primary,
      [injectionHook, searchRanking],
    );

    expect(inDegree.get(injectionHook)).toBe(1); // linked-to by Search Ranking
    expect(inDegree.get(searchRanking)).toBe(0);
  });

  test("fewer than 2 candidates returns an empty map", async () => {
    const inDegree = await linkGraphService.inlinkCounts(
      fixture.container,
      fixture.primary,
      [underKb("Alpha/Injection Hook.md")],
    );
    expect(inDegree.size).toBe(0);
  });

  test("a self-link is never counted", async () => {
    // Alpha/Alpha.md links to Injection Hook, not to itself — this asserts
    // the candidate set alone (Alpha.md paired with itself would be a
    // degenerate single-candidate case anyway) never inflates Alpha's own
    // in-degree via its own outgoing links.
    const alpha = underKb("Alpha/Alpha.md");
    const injectionHook = underKb("Alpha/Injection Hook.md");

    const inDegree = await linkGraphService.inlinkCounts(
      fixture.container,
      fixture.primary,
      [alpha, injectionHook],
    );

    expect(inDegree.get(alpha)).toBe(0);
    expect(inDegree.get(injectionHook)).toBe(1);
  });
});

describe("index/graph LinkGraphService.neighbors", () => {
  test("returns the wikilink targets of one note", async () => {
    const alpha = underKb("Alpha/Alpha.md");
    const targets = await linkGraphService.neighbors(
      fixture.container,
      fixture.primary,
      alpha,
    );
    // `links.dst` is stored with the `|display` label already stripped at
    // parse time (`note.ts`'s `extractWikilinks`), so the raw wikilink TARGET
    // survives, not its display text.
    expect(targets).toContain("Alpha/Injection Hook");
  });

  test("a note with no outgoing links has no neighbors", async () => {
    const targets = await linkGraphService.neighbors(
      fixture.container,
      fixture.primary,
      underKb("Gamma/Adjacent.md"),
    );
    expect(targets).toEqual([]);
  });
});
