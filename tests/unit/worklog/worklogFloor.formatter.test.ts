import { describe, expect, test } from "bun:test";

import { formatFloorBlock } from "../../../src/worklog/worklogFloor.formatter.ts";

describe("formatFloorBlock", () => {
  test("golden: every field present", () => {
    const rendered = formatFloorBlock({
      date: "2026-08-14",
      reason: "other",
      branch: "p2-domain",
      uncommitted: "M src/knowledge/note.ts",
      commits: "abc1234 port note.ts\ndef5678 port rank.ts",
    });
    expect(rendered).toBe(
      [
        "<!-- auto (SessionEnd 2026-08-14, reason=other) -->",
        "<!-- branch: p2-domain -->",
        "<!-- uncommitted: M src/knowledge/note.ts -->",
        "<!-- recent commits:",
        "  abc1234 port note.ts",
        "  def5678 port rank.ts",
        "-->",
      ].join("\n"),
    );
  });

  test("no reason falls back to n/a", () => {
    expect(
      formatFloorBlock({
        date: "2026-08-14",
        reason: "",
        branch: "",
        uncommitted: "",
        commits: "",
      }),
    ).toBe(
      "<!-- auto (SessionEnd 2026-08-14, reason=n/a) -->\n<!-- no git activity detected -->",
    );
  });

  test("branch/uncommitted/commits all empty still yields the no-activity line", () => {
    const rendered = formatFloorBlock({
      date: "2026-08-14",
      reason: "clear",
      branch: "",
      uncommitted: "",
      commits: "",
    });
    expect(rendered).toBe(
      "<!-- auto (SessionEnd 2026-08-14, reason=clear) -->\n<!-- no git activity detected -->",
    );
  });
});
