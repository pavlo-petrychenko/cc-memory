import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { relKey } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchKind } from "@/retrieval/retrieval.typedefs.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { LinkGraphService } from "@/retrieval/store/graph/graph.service.ts";
import { IndexBuildService } from "@/retrieval/store/indexBuild/indexBuild.service.ts";
import { SchemaService } from "@/retrieval/store/schema/schema.service.ts";
import { SearchService } from "@/retrieval/store/search/search.service.ts";
import {
  setupIndexFixture,
  teardownIndexFixture,
  type IndexFixture,
} from "@/testing/fixtures/retrievalIndex.fixture.ts";

// The default for CCMEM_LINK_BOOST (`core/config`'s LINK_BOOST_DEFAULT) —
// searchFused requires it explicitly rather than re-deriving its own copy.
const LINK_BOOST = 0.003;

const connectionService = new IndexConnectionService(new SchemaService());
const indexBuildService = new IndexBuildService(connectionService);
const searchService = new SearchService(
  connectionService,
  new FtsQueryBuilder(new TokenizerParser()),
  new Ranker(),
  new LinkGraphService(connectionService),
);

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

/** relKey each hit's path against the primary workspace's kb. */
function relPaths(hits: readonly { readonly path: AbsPath }[]): readonly string[] {
  return hits.map((hit) => relKey(hit.path, fixture.primary.kb));
}

describe("index/search — notes retrieval", () => {
  test.each(["inject", "injection", "blocking", "block"])(
    "%s matches 'Injection Hook' via Porter stemming",
    async (query) => {
      const hits = await searchService.search(fixture.container, fixture.primary, query);
      expect(relPaths(hits)).toContain("Alpha/Injection Hook");
    },
  );

  test("'overall score' and 'overallScore' both match 'Scoring Camel'", async () => {
    const spaced = await searchService.search(
      fixture.container,
      fixture.primary,
      "overall score",
    );
    const glued = await searchService.search(
      fixture.container,
      fixture.primary,
      "overallScore",
    );
    expect(relPaths(spaced)).toContain("Alpha/Scoring Camel");
    expect(relPaths(glued)).toContain("Alpha/Scoring Camel");
  });

  test("a title hit outranks a body hit", async () => {
    const hits = await searchService.search(
      fixture.container,
      fixture.primary,
      "kryptonite",
      { limit: 5 },
    );
    const paths = relPaths(hits);
    expect(paths[0]).toBe("Beta/Title Kryptonite");
    expect(paths).toContain("Beta/Body Kryptonite");
  });

  test("an off-topic query returns nothing", async () => {
    const hits = await searchService.search(
      fixture.container,
      fixture.primary,
      "quantum entanglement submarine",
    );
    expect(hits).toEqual([]);
  });

  // An FTS5 syntax error in the raw query is swallowed to [] rather than thrown.
  test.each(['"unterminated', "star*", "a OR b", "NEAR broken"])(
    "%s never throws",
    async (query) => {
      const hits = await searchService.search(fixture.container, fixture.primary, query);
      expect(Array.isArray(hits)).toBe(true);
    },
  );

  test("a prompt containing NEAR/OR/AND still retrieves", async () => {
    const hits = await searchService.search(
      fixture.container,
      fixture.primary,
      "does injecting tokens use NEAR or AND?",
    );
    expect(relPaths(hits)).toContain("Alpha/Injection Hook");
  });

  test("searchFused ranks the adjacent 'red car' note above the far-apart one", async () => {
    const hits = await searchService.searchFused(
      fixture.container,
      fixture.primary,
      "red car",
      { limit: 5, linkBoost: LINK_BOOST },
    );
    const paths = relPaths(hits);
    expect(paths).toContain("Gamma/Adjacent");
    expect(paths).toContain("Gamma/Apart");
    expect(paths.indexOf("Gamma/Adjacent")).toBeLessThan(paths.indexOf("Gamma/Apart"));
    expect(hits[0]?.rankScore).toBeGreaterThan(0);
  });

  test("a fused hit carries both `score` and `rankScore`", async () => {
    const hits = await searchService.searchFused(
      fixture.container,
      fixture.primary,
      "injecting salient tokens",
      {
        limit: 3,
        linkBoost: LINK_BOOST,
      },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(Number.isFinite(hits[0]?.score)).toBe(true);
    expect(Number.isFinite(hits[0]?.rankScore)).toBe(true);
  });

  // searchFused degrades to pure BM25 when there's no adjacent-term pair.
  test("searchFused never throws on a single-term query with no phrase pair", async () => {
    const hits = await searchService.searchFused(
      fixture.container,
      fixture.primary,
      "kryptonite",
      {
        limit: 5,
        linkBoost: LINK_BOOST,
      },
    );
    expect(relPaths(hits)[0]).toBe("Beta/Title Kryptonite");
  });

  test("searchFused returns [] when the token search itself finds nothing", async () => {
    const hits = await searchService.searchFused(
      fixture.container,
      fixture.primary,
      "quantum entanglement submarine",
      {
        linkBoost: LINK_BOOST,
      },
    );
    expect(hits).toEqual([]);
  });
});

describe("index/search — worklog retrieval", () => {
  test("kind: worklog finds the incident entry", async () => {
    const hits = await searchService.search(
      fixture.container,
      fixture.primary,
      "rollback incident gateway",
      {
        kind: SearchKind.Worklog,
      },
    );
    const rollbackOnly = await searchService.search(
      fixture.container,
      fixture.primary,
      "rollback",
      {
        kind: SearchKind.Worklog,
      },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(rollbackOnly.length).toBeGreaterThan(0);
  });

  test("a workspace's worklog search never surfaces another workspace's content", async () => {
    const hits = await searchService.search(
      fixture.container,
      fixture.secondary,
      "rollback incident gateway",
      {
        kind: SearchKind.Worklog,
      },
    );
    expect(hits).toEqual([]);
  });
});
