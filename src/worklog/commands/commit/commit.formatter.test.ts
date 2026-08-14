import { describe, expect, test } from "bun:test";

import { CommitFormatter } from "@/worklog/commands/commit/commit.formatter.ts";

describe("CommitFormatter", () => {
  const formatter = new CommitFormatter();

  test("commitSkipped", () => {
    expect(formatter.commitSkipped("primary")).toBe("primary: not a git repo, skipping");
  });

  test("commitResult distinguishes a real commit from an empty one", () => {
    expect(formatter.commitResult("primary", true)).toBe("primary: committed");
    expect(formatter.commitResult("primary", false)).toBe("primary: nothing to commit");
  });
});
