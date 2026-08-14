import { describe, expect, test } from "bun:test";

import {
  dedupeCandidates,
  entryTemplate,
  extractCandidates,
  stateTemplate,
} from "../../../src/worklog/worklogFormat.ts";

describe("stateTemplate", () => {
  test("golden string", () => {
    expect(
      stateTemplate({ workspace: "homeserver", slug: "cc-memory", date: "2026-08-14" }),
    ).toBe(
      `---
type: worktree-state
workspace: homeserver
worktree: cc-memory
updated: 2026-08-14
---
# cc-memory — working state

## Current focus
_(nothing yet)_

## Open threads
- [ ] _(none)_

## Working notes (ephemeral, not yet KB)
- _(none)_
`,
    );
  });
});

describe("entryTemplate", () => {
  test("golden string", () => {
    expect(
      entryTemplate({
        time: "14:32",
        topic: "wrap-gate port",
        changes: "ported rank.ts",
        learned: "RRF is symmetric",
        decided: "keep k=60",
        open: "none",
        refs: "[[rank]]",
      }),
    ).toBe(
      `## 14:32 — wrap-gate port
**Changes:** ported rank.ts
**Learned:** RRF is symmetric
**Decided:** keep k=60
**Open:** none
**Refs:** [[rank]]
`,
    );
  });
});

describe("extractCandidates", () => {
  test("a #promote line has the tag and any leading **Field:** prefix stripped, then trimmed of ' -*'", () => {
    const candidates = extractCandidates(
      "- **Learned:** RRF is symmetric #promote",
      "day/2026-08-14.md",
    );
    expect(candidates).toEqual([{ text: "RRF is symmetric", src: "day/2026-08-14.md" }]);
  });

  test("a bare #promote line (no field prefix) still strips ' -*'", () => {
    const candidates = extractCandidates("- keep k=60 #promote", "day/x.md");
    expect(candidates).toEqual([{ text: "keep k=60", src: "day/x.md" }]);
  });

  test("a Learned/Decided line longer than 12 chars is a candidate", () => {
    const candidates = extractCandidates(
      "**Learned:** this text is definitely long enough",
      "day/x.md",
    );
    expect(candidates).toEqual([
      { text: "this text is definitely long enough", src: "day/x.md" },
    ]);
  });

  test("a Learned/Decided line of 12 chars or fewer is dropped (strictly > 12)", () => {
    expect(extractCandidates("**Learned:** short", "day/x.md")).toEqual([]);
  });

  test("Decided is matched case-insensitively", () => {
    const candidates = extractCandidates(
      "**decided:** ship the TypeScript port this week",
      "day/x.md",
    );
    expect(candidates).toEqual([
      { text: "ship the TypeScript port this week", src: "day/x.md" },
    ]);
  });

  test("an unrelated line yields no candidates", () => {
    expect(extractCandidates("## 14:32 — some topic", "day/x.md")).toEqual([]);
  });

  test("a #promote match anywhere on the line still fires (search, not match)", () => {
    const candidates = extractCandidates(
      "some prose mentioning #promote worthy work",
      "day/x.md",
    );
    expect(candidates).toEqual([
      { text: "some prose mentioning  worthy work", src: "day/x.md" },
    ]);
  });
});

describe("dedupeCandidates", () => {
  test("drops case-insensitive duplicates, keeping the first occurrence", () => {
    const deduped = dedupeCandidates([
      { text: "Same Fact", src: "a.md" },
      { text: "same fact", src: "b.md" },
      { text: "Different fact", src: "c.md" },
    ]);
    expect(deduped).toEqual([
      { text: "Same Fact", src: "a.md" },
      { text: "Different fact", src: "c.md" },
    ]);
  });

  test("empty input yields empty output", () => {
    expect(dedupeCandidates([])).toEqual([]);
  });
});
