/**
 * Unit tests for the divergence allowlist lookup. Most cases below use an
 * explicit allowlist so this file doesn't depend on which real bugfix rows
 * have landed; the last test exercises the real `DIVERGENCES` export against
 * P8's bugfix #3 entries (the reflector's two-cursor rework), which is
 * guaranteed to exist from this packet onward.
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

  test("defaults to the real DIVERGENCES export", () => {
    expect(findDivergence("cli/some-case-with-no-registered-divergence")).toBeUndefined();
    expect(findDivergence("cli/reflect-no-candidates-headless")?.bugfix).toBe(3);
    expect(DIVERGENCES.length).toBeGreaterThan(0);
  });
});
