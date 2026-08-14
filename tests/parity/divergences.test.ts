/**
 * Unit tests for the divergence allowlist lookup. DIVERGENCES itself is
 * empty in P1 (see its own doc comment), so a test against the real export
 * alone would never actually invoke findDivergence's search predicate —
 * these use an explicit allowlist to exercise both outcomes.
 */
import { describe, expect, test } from "bun:test";

import { DIVERGENCES, type Divergence, findDivergence } from "./divergences.ts";

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

  test("defaults to the (empty, for P1) real DIVERGENCES export", () => {
    expect(findDivergence("anything")).toBeUndefined();
    expect(DIVERGENCES).toEqual([]);
  });
});
