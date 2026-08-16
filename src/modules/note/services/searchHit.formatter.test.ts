import { describe, expect, test } from "bun:test";

import { NO_HITS_MESSAGE } from "@/modules/memory/commands/searchMemory.constants.ts";
import { SearchHitFormatter } from "@/modules/note/services/searchHit.formatter.ts";

const searchFormatter = new SearchHitFormatter();

describe("NO_HITS_MESSAGE", () => {
  test("is the exact fallback text", () => {
    expect(NO_HITS_MESSAGE).toBe("(no hits)");
  });
});

describe("SearchHitFormatter.hit", () => {
  test("two lines: bullet with title/path, then indented snippet", () => {
    expect(
      searchFormatter.hit("Kryptonite Handbook", "Beta/Title Kryptonite.md", "…snippet…"),
    ).toEqual(["• Kryptonite Handbook  (Beta/Title Kryptonite.md)", "  …snippet…"]);
  });
});
