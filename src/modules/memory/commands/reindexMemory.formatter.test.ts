import { describe, expect, test } from "bun:test";

import { ReindexFormatter } from "@/modules/memory/commands/reindexMemory.formatter.ts";

const reindexFormatter = new ReindexFormatter();

describe("ReindexFormatter.line", () => {
  test("the +/~/- summary line", () => {
    expect(reindexFormatter.line("primary", 2, 1, 0, 8)).toBe(
      "primary: +2 ~1 -0 = 8 notes",
    );
  });
});
