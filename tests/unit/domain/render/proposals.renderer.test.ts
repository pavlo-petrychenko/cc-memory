import { describe, expect, test } from "bun:test";

import { ReflectorAction } from "../../../../src/domain/Reflector.ts";
import {
  decisionPrompt,
  renderBrief,
  renderProposals,
} from "../../../../src/domain/render/proposals.renderer.ts";

describe("decisionPrompt (bin/reflector.py:99-125,128-131)", () => {
  test("substitutes candidates then related notes, in that order", () => {
    const prompt = decisionPrompt(
      [{ text: "RRF is symmetric", src: "cc-memory/2026-08-14.md" }],
      [{ title: "Rank", path: "CC-memory/Rank.md", snippet: "fusion math" }],
    );
    expect(prompt).toContain("You are the consolidation reflector");
    expect(prompt).toContain(
      "## Candidates\n- (cc-memory/2026-08-14.md) RRF is symmetric\n\n" +
        "## Existing related KB notes\n- Rank [CC-memory/Rank.md]: fusion math\n",
    );
    // Candidates section must come before the related-notes section.
    expect(prompt.indexOf("## Candidates")).toBeLessThan(
      prompt.indexOf("## Existing related KB notes"),
    );
  });

  test("no related notes falls back to (none)", () => {
    const prompt = decisionPrompt([{ text: "t", src: "s" }], []);
    expect(prompt).toContain("## Existing related KB notes\n(none)\n");
  });
});

describe("renderProposals (bin/reflector.py:147-176)", () => {
  test("error path: raw candidates listed for manual triage, count is the candidate count", () => {
    const { content, count } = renderProposals({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [
        { text: "fact one", src: "a.md" },
        { text: "fact two", src: "b.md" },
      ],
      error: "claude CLI not found",
      decisions: [],
    });
    expect(count).toBe(2);
    expect(content).toContain("> ⚠ LLM decision step unavailable (claude CLI not found)");
    expect(content).toContain(
      "## Raw candidates\n- [ ] (a.md) fact one\n- [ ] (b.md) fact two\n",
    );
  });

  test("kept decisions must clear both the action allowlist and the importance floor (>=4)", () => {
    const { content, count } = renderProposals({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [],
      error: null,
      decisions: [
        {
          action: ReflectorAction.Add,
          title: "Kept Fact",
          folder: "CC-memory",
          importance: 7,
          rationale: "durable",
          source: "a.md",
          body: "line one\nline two",
        },
        { action: ReflectorAction.Add, title: "Too Low", importance: 3 },
        { action: ReflectorAction.Noop, title: "Not This" },
      ],
    });
    expect(count).toBe(1);
    expect(content).toContain("## [ ] ADD: Kept Fact  ·  importance 7");
    expect(content).toContain("- **Target:** `CC-memory/Kept Fact.md`");
    expect(content).toContain("  ```markdown\n  line one\n  line two\n  ```");
    expect(content).not.toContain("Too Low");
    expect(content).toContain("<!-- 1 candidates judged NOOP -->");
  });

  test("no kept decisions renders the 'no promotions' line", () => {
    const { content, count } = renderProposals({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [],
      error: null,
      decisions: [{ action: ReflectorAction.Noop }],
    });
    expect(count).toBe(0);
    expect(content).toContain(
      "_No promotions proposed (all NOOP / below importance threshold)._",
    );
  });

  test("an explicit path target wins over folder/title", () => {
    const { content } = renderProposals({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [],
      error: null,
      decisions: [
        {
          action: ReflectorAction.Update,
          path: "CC-memory/Existing.md",
          folder: "ignored",
          title: "ignored",
          importance: 5,
        },
      ],
    });
    expect(content).toContain("- **Target:** `CC-memory/Existing.md`");
  });

  test("an empty body produces an empty fenced block, not a spurious blank line", () => {
    const { content } = renderProposals({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [],
      error: null,
      decisions: [
        { action: ReflectorAction.Add, title: "T", folder: "F", importance: 4 },
      ],
    });
    expect(content).toContain("- **Body:**\n  ```markdown\n  ```\n");
  });
});

describe("renderBrief (bin/reflector.py:184-198)", () => {
  test("golden: candidates then related notes", () => {
    const content = renderBrief({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [{ text: "fact", src: "a.md" }],
      related: [{ title: "Rank", path: "CC-memory/Rank.md", snippet: "fusion math" }],
    });
    expect(content).toBe(
      [
        "# Consolidation brief — homeserver — 2026-08-14",
        "",
        "Distilled from worklogs since the last run. For each candidate decide " +
          "ADD / UPDATE / INVALIDATE / NOOP against the existing KB; propose, then " +
          "apply approved ones via `save-learning` (ask before any KB write).",
        "",
        "## Candidates",
        "- (a.md) fact",
        "",
        "## Existing related KB notes",
        "- Rank [CC-memory/Rank.md]: fusion math",
        "",
      ].join("\n"),
    );
  });

  test("no related notes renders (none)", () => {
    const content = renderBrief({
      workspaceId: "homeserver",
      date: "2026-08-14",
      candidates: [],
      related: [],
    });
    expect(content).toContain("## Existing related KB notes\n(none)\n");
  });
});
