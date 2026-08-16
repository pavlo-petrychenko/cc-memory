import { describe, expect, test } from "bun:test";

import { WrapGateFormatter } from "@/modules/worklog/hooks/wrapGate/wrapGate.formatter.ts";

describe("WrapGateFormatter.formatNudge", () => {
  const formatter = new WrapGateFormatter();

  test("golden: plural file count", () => {
    expect(formatter.formatNudge({ slug: "cc-memory", dirtyCount: 3 })).toBe(
      "📝 Unsaved work in `cc-memory` (3 uncommitted files). Consider running the " +
        "`remember` skill to update this worktree's worklog (summary of changes + " +
        "open threads) before finishing.",
    );
  });

  test("singular file count has no trailing s", () => {
    expect(formatter.formatNudge({ slug: "cc-memory", dirtyCount: 1 })).toContain(
      "(1 uncommitted file)",
    );
  });
});

describe("WrapGateFormatter.formatBlockReason", () => {
  const formatter = new WrapGateFormatter();

  test("golden", () => {
    expect(formatter.formatBlockReason({ slug: "cc-memory", dirtyCount: 6 })).toBe(
      "Before you finish: capture this session in working memory for `cc-memory` " +
        "(6 uncommitted files). Run the `remember` skill — write today's worklog " +
        "entry with a **summary of ALL changes you made**, plus Learned/Decided/Open " +
        "(tag durable findings #promote), and refresh STATE.md. Worklogs need no approval.",
    );
  });
});
