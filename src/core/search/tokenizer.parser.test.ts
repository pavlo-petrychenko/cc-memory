import { describe, expect, test } from "bun:test";

import { STOPWORDS } from "@/core/search/search.constants.ts";
import { TokenizerParser } from "@/core/search/tokenizer.parser.ts";

const tokenizerParser = new TokenizerParser();

describe("STOPWORDS", () => {
  test("has exactly the 28 known stopwords", () => {
    expect(STOPWORDS.size).toBe(28);
    expect(STOPWORDS.has("the")).toBe(true);
    expect(STOPWORDS.has("lets")).toBe(true);
  });
});

// A chunk must emit BOTH the glued lowercase form AND every camel/underscore-split
// part, so `overallScore` and `overall score` retrieve each other regardless of
// which form the note was written in.
describe("TokenizerParser.subtokens", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly chunk: string;
    readonly expected: readonly string[];
  }> = [
    {
      name: "camelCase splits into parts + glued form",
      chunk: "overallScore",
      expected: ["overall", "score", "overallscore"],
    },
    {
      name: "snake_case splits into parts + glued form",
      chunk: "wrap_gate",
      expected: ["wrap", "gate", "wrapgate"],
    },
    { name: "ALLCAPS acronym stays whole, lowercased", chunk: "SQL", expected: ["sql"] },
    {
      name: "acronym + word splits at the boundary",
      chunk: "HTTPServer",
      expected: ["http", "server", "httpserver"],
    },
    { name: "a 2-char identifier is kept", chunk: "db", expected: ["db"] },
    { name: "a 1-char identifier is dropped (too short)", chunk: "x", expected: [] },
    { name: "pure digits are dropped", chunk: "2026", expected: [] },
    { name: "a stopword chunk is dropped", chunk: "the", expected: [] },
    // "v" and "2" are individually too short/pure-digit to keep; only the
    // longer "beta" part and the glued form survive.
    {
      name: "a short/pure-digit camel part is dropped, longer parts survive",
      chunk: "v2beta",
      expected: ["beta", "v2beta"],
    },
  ];

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect([...tokenizerParser.subtokens(testCase.chunk)].toSorted()).toEqual(
        [...testCase.expected].toSorted(),
      );
    });
  }
});

describe("TokenizerParser.salientTokens", () => {
  test("camel split, glued form, 2-char identifier kept, stopwords dropped", () => {
    const tokens = tokenizerParser.salientTokens(
      "How do the wrap-gate and overallScore work with db?",
    );
    expect(tokens.has("wrap")).toBe(true);
    expect(tokens.has("gate")).toBe(true);
    expect(tokens.has("overall")).toBe(true);
    expect(tokens.has("score")).toBe(true);
    expect(tokens.has("overallscore")).toBe(true);
    expect(tokens.has("db")).toBe(true);
    expect(tokens.has("how")).toBe(false);
    expect(tokens.has("the")).toBe(false);
  });

  test("pure digits are never a salient token", () => {
    expect(tokenizerParser.salientTokens("the 2026 plan").has("2026")).toBe(false);
  });
});

describe("TokenizerParser.orderedTerms", () => {
  test("keeps sequence and per-chunk sub-word order", () => {
    expect(tokenizerParser.orderedTerms("red car")).toEqual(["red", "car"]);
  });

  test("camel-split parts replace the glued form when any part is kept", () => {
    expect(tokenizerParser.orderedTerms("overallScore")).toEqual(["overall", "score"]);
  });

  test("falls back to the glued form when no camel part is kept", () => {
    // "AI" alone camel-splits to one part ("ai"), which IS kept (length 2) — use
    // a chunk whose only camel part is too short to be kept, so the fallback path
    // (the glued form) is what fires.
    expect(tokenizerParser.orderedTerms("x9")).toEqual(["x9"]);
  });

  test("drops stopwords and pure-digit chunks entirely", () => {
    expect(tokenizerParser.orderedTerms("the 2026 plan")).toEqual(["plan"]);
  });
});
