import { describe, expect, test } from "bun:test";

import { entryTemplate, stateTemplate } from "./worklogFormat.ts";

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
