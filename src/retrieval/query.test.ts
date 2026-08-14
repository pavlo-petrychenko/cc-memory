import { describe, expect, test } from "bun:test";

import { ftsQuery, phraseQuery } from "./query.ts";

describe("ftsQuery", () => {
  test("ORs quoted salient tokens, sorted", () => {
    expect(ftsQuery("red car")).toBe('"car" OR "red"');
  });

  test("a natural prompt containing FTS operator words is tokenized, not passed through raw", () => {
    // "OR"/"NEAR"/"AND" are ordinary English words here, not raw FTS5 syntax —
    // every token is lowercased and quoted, so an operator word can never be
    // mistaken for ftsQuery's own unquoted " OR " join separator.
    const query = ftsQuery("does injecting tokens use NEAR or AND?");
    expect(query.includes('"near"')).toBe(true);
    expect(query.includes('"or"')).toBe(true);
    expect(query.includes("AND")).toBe(false);
  });

  test("caps at 32 tokens", () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const tokenCount = ftsQuery(words).split(" OR ").length;
    expect(tokenCount).toBe(32);
  });

  test("empty text yields the empty string", () => {
    expect(ftsQuery("")).toBe("");
  });
});

describe("phraseQuery", () => {
  test("contains a NEAR clause for two adjacent terms", () => {
    expect(phraseQuery("red car")).toContain("NEAR");
  });

  test("a single term yields the empty string", () => {
    expect(phraseQuery("solo")).toBe("");
  });

  test("uses the given window", () => {
    expect(phraseQuery("red car", 3)).toBe('NEAR("red" "car", 3)');
  });

  test("skips a self-adjacent pair (a === b)", () => {
    expect(phraseQuery("red red car")).toBe('NEAR("red" "car", 8)');
  });

  test("de-duplicates identical clauses", () => {
    expect(phraseQuery("red car red car")).toBe(
      'NEAR("red" "car", 8) OR NEAR("car" "red", 8)',
    );
  });

  test("caps at 24 clauses", () => {
    // Each "aN" chunk's only camel-split part ("a") is too short to keep, so
    // `orderedTerms` falls back to the glued form — which, unlike the dropped
    // camel part, keeps the distinguishing digit. 30 distinct terms -> 29
    // distinct adjacent pairs, capped to 24.
    const words = Array.from({ length: 30 }, (_, index) => `a${index}`).join(" ");
    const clauseCount = phraseQuery(words).split(" OR ").length;
    expect(clauseCount).toBe(24);
  });
});
