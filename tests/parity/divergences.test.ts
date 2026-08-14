/**
 * Unit tests for the divergence allowlist lookup. Most cases use an explicit
 * allowlist fixture so this file doesn't depend on which bugfix rows have landed;
 * the last test exercises the REAL `DIVERGENCES` export against both P7's
 * ([[bugfixes]] #1, wrap-state.json) and P8's (#3, the reflector's two cursors)
 * entries, which are guaranteed present from those packets onward.
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
    expect(findDivergence("cli/some-case-with-no-registered-divergence")).toBeUndefined();
    expect(
      findDivergence("hooks/wrap-gate/happy-path-first-nudge (ts-vs-python)")?.bugfix,
    ).toBe(1);
    expect(findDivergence("cli/reflect-no-candidates-headless")?.bugfix).toBe(3);
    expect(DIVERGENCES.length).toBeGreaterThan(0);
  });
});
