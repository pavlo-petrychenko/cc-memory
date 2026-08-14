/**
 * Unit tests for the divergence allowlist lookup. DIVERGENCES itself was
 * empty through P1-P6 (see its own doc comment) — the first real entries
 * are P7's ([[bugfixes]] #1, wrap-state.json). These tests use an explicit
 * allowlist fixture to exercise both outcomes independent of whatever the
 * real export currently holds.
 */
import { describe, expect, test } from "bun:test";

import { type Divergence, findDivergence } from "./divergences.ts";

describe("findDivergence", () => {
  const allowlist: readonly Divergence[] = [
    {
      case: "cli/reindex-all-workspaces",
      reason: "wrap-state.json replaces markers",
      bugfix: 1,
      expectedDiff: "marker file layout differs",
    },
    {
      case: "hooks/worklog-floor/happy-path",
      reason: "rotation added",
      bugfix: 2,
      expectedDiff: "rotation files appear",
    },
  ];

  test("finds the matching entry by case name", () => {
    expect(findDivergence("hooks/worklog-floor/happy-path", allowlist)?.bugfix).toBe(2);
  });

  test("returns undefined when no entry matches", () => {
    expect(findDivergence("cli/search-default-cwd", allowlist)).toBeUndefined();
  });

  test("defaults to the real DIVERGENCES export", () => {
    expect(findDivergence("anything")).toBeUndefined();
    expect(
      findDivergence("hooks/wrap-gate/happy-path-first-nudge (ts-vs-python)")?.bugfix,
    ).toBe(1);
  });
});
