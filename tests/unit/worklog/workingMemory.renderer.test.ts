import { describe, expect, test } from "bun:test";

import { renderWorkingMemory } from "../../../src/worklog/workingMemory.renderer.ts";

describe("renderWorkingMemory (C4)", () => {
  test("with state: trims it and appends the wrap reminder", () => {
    const rendered = renderWorkingMemory({
      workspaceId: "homeserver",
      slug: "cc-memory",
      state: "\n## Current focus\nporting rank.ts\n\n",
    });
    expect(rendered).toBe(
      "# Working memory — workspace `homeserver`, worktree `cc-memory`\n\n" +
        "## Current focus\nporting rank.ts\n\n" +
        "_(Update this at wrap with the `remember` skill.)_",
    );
  });

  test("without state: the 'start one' variant", () => {
    const rendered = renderWorkingMemory({
      workspaceId: "homeserver",
      slug: "cc-memory",
      state: null,
    });
    expect(rendered).toBe(
      "# Working memory — workspace `homeserver`, worktree `cc-memory`\n\n" +
        "_No working memory yet for this worktree._ Start one with the `remember` " +
        "skill (it writes `STATE.md` + a dated journal entry).",
    );
  });
});
