import { describe, expect, test } from "bun:test";

import { formatReindexLine } from "@/retrieval/commands/reindex/reindex.formatter.ts";

describe("formatReindexLine", () => {
  test("the +/~/- summary line", () => {
    expect(formatReindexLine("primary", 2, 1, 0, 8)).toBe("primary: +2 ~1 -0 = 8 notes");
  });
});
