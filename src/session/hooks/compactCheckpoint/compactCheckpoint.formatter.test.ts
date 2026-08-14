import { describe, expect, test } from "bun:test";

import { formatCompactBlock } from "@/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";

describe("formatCompactBlock", () => {
  test("golden with an explicit trigger", () => {
    expect(
      formatCompactBlock({ trigger: "manual", summary: "distilled context here" }),
    ).toBe(
      "<!-- compaction checkpoint (manual) -->\n**Compaction summary:**\n\ndistilled context here",
    );
  });

  test("an empty trigger falls back to auto", () => {
    expect(formatCompactBlock({ trigger: "", summary: "s" })).toBe(
      "<!-- compaction checkpoint (auto) -->\n**Compaction summary:**\n\ns",
    );
  });
});
