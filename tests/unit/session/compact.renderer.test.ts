import { describe, expect, test } from "bun:test";

import { renderCompactBlock } from "../../../src/session/compact.renderer.ts";

describe("renderCompactBlock", () => {
  test("golden with an explicit trigger", () => {
    expect(
      renderCompactBlock({ trigger: "manual", summary: "distilled context here" }),
    ).toBe(
      "<!-- compaction checkpoint (manual) -->\n**Compaction summary:**\n\ndistilled context here",
    );
  });

  test("an empty trigger falls back to auto", () => {
    expect(renderCompactBlock({ trigger: "", summary: "s" })).toBe(
      "<!-- compaction checkpoint (auto) -->\n**Compaction summary:**\n\ns",
    );
  });
});
