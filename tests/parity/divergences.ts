/**
 * The parity allowlist: every INTENTIONAL Python-vs-TypeScript behavior
 * difference, one entry per row of the plan doc's "bugfixes" table. The
 * differ (tests/parity/harness.ts assertParity) fails a case two ways:
 * a diff with no entry here ("unexpected diff"), or an entry here whose
 * case produced no diff at all ("missing expected diff" — a stale entry
 * that must be removed). Never edit an assertion to make a real diff
 * disappear; add a divergence entry instead, with a reason and the
 * bugfix number it corresponds to.
 */
export type Divergence = {
  readonly case: string;
  readonly reason: string;
  readonly bugfix: number;
  readonly expectedDiff: string;
};

// Empty for P1. This harness runs the PYTHON implementation on BOTH sides of
// every case (tests/parity/self.test.ts) — there is no TypeScript yet, so
// there is no intentional Python-vs-TypeScript difference to allowlist.
// Packets P2-P10 append one entry per plan doc "bugfixes" row as their own
// parity tests exercise a deliberate fix (e.g. bugfix #1's wrap-state.json
// replacing per-session `.wrap-<id>` marker files).
export const DIVERGENCES: readonly Divergence[] = [];

export function findDivergence(
  caseName: string,
  allowlist: readonly Divergence[] = DIVERGENCES,
): Divergence | undefined {
  return allowlist.find((divergence) => divergence.case === caseName);
}
