import { expect, test } from "bun:test";

import type { JournalEntry, WorktreeState } from "@/modules/worklog/worklog.entity.ts";

test("a WorktreeState carries its slug and raw STATE.md body", () => {
  const state: WorktreeState = { slug: "wt1", body: "# wt1\n\n## Current focus\n" };
  expect(state.slug).toBe("wt1");
  expect(state.body).toContain("## Current focus");
});

test("a JournalEntry carries its slug, date and raw body", () => {
  const entry: JournalEntry = {
    slug: "wt1",
    date: "2026-01-01",
    body: "## 10:00 — incident\n",
  };
  expect(entry.date).toBe("2026-01-01");
  expect(entry.body).toContain("incident");
});
