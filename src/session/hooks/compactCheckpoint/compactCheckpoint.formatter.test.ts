import { describe, expect, test } from "bun:test";

import { CompactCheckpointFormatter } from "@/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";

describe("CompactCheckpointFormatter.formatCompactBlock", () => {
  const formatter = new CompactCheckpointFormatter();

  test("golden with an explicit trigger", () => {
    expect(
      formatter.formatCompactBlock({
        trigger: "manual",
        summary: "distilled context here",
      }),
    ).toBe(
      "<!-- compaction checkpoint (manual) -->\n**Compaction summary:**\n\ndistilled context here",
    );
  });

  test("an empty trigger falls back to auto", () => {
    expect(formatter.formatCompactBlock({ trigger: "", summary: "s" })).toBe(
      "<!-- compaction checkpoint (auto) -->\n**Compaction summary:**\n\ns",
    );
  });
});
