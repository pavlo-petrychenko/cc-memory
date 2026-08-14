import { describe, expect, test } from "bun:test";

import {
  renderBlockReason,
  renderNudge,
} from "../../../../src/domain/render/wrapGate.renderer.ts";

describe("renderNudge (C4)", () => {
  test("golden: plural file count", () => {
    expect(renderNudge({ slug: "cc-memory", dirtyCount: 3 })).toBe(
      "📝 Unsaved work in `cc-memory` (3 uncommitted files). Consider running the " +
        "`remember` skill to update this worktree's worklog (summary of changes + " +
        "open threads) before finishing.",
    );
  });

  test("singular file count has no trailing s", () => {
    expect(renderNudge({ slug: "cc-memory", dirtyCount: 1 })).toContain(
      "(1 uncommitted file)",
    );
  });
});

describe("renderBlockReason (C4)", () => {
  test("golden", () => {
    expect(renderBlockReason({ slug: "cc-memory", dirtyCount: 6 })).toBe(
      "Before you finish: capture this session in working memory for `cc-memory` " +
        "(6 uncommitted files). Run the `remember` skill — write today's worklog " +
        "entry with a **summary of ALL changes you made**, plus Learned/Decided/Open " +
        "(tag durable findings #promote), and refresh STATE.md. Worklogs need no approval.",
    );
  });
});
