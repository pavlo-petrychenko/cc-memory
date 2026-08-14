import { describe, expect, test } from "bun:test";

import { NO_HITS_MESSAGE } from "@/retrieval/commands/search/search.constants.ts";
import { formatSearchHit } from "@/retrieval/commands/search/search.formatter.ts";

describe("NO_HITS_MESSAGE", () => {
  test("is the exact fallback text", () => {
    expect(NO_HITS_MESSAGE).toBe("(no hits)");
  });
});

describe("formatSearchHit", () => {
  test("two lines: bullet with title/path, then indented snippet", () => {
    expect(
      formatSearchHit("Kryptonite Handbook", "Beta/Title Kryptonite.md", "…snippet…"),
    ).toEqual(["• Kryptonite Handbook  (Beta/Title Kryptonite.md)", "  …snippet…"]);
  });
});
