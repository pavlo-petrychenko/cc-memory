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

/**
 * Behavior changes already SHIPPED in the domain layer that no parity case can
 * exercise yet, because they only become observable once the TypeScript CLI (P6)
 * and hooks (P7) exist. They are NOT consulted by the differ — putting them in
 * `DIVERGENCES` now would fail as stale entries.
 *
 * P6/P7/P8: when your parity case makes one of these produce a real diff, MOVE the
 * entry into `DIVERGENCES` with the case name filled in. Do not silently absorb the
 * diff into an assertion.
 */
export const PENDING_DIVERGENCES: readonly Omit<Divergence, "case">[] = [
  {
    reason:
      "Bad-input stderr TEXT differs. Python got its CLI from argparse, which prints " +
      "a `usage: memory [-h] {workspace,resolve,...}` block plus " +
      "`invalid choice: 'x'`; the hand-rolled parser prints `unknown command: x`. " +
      "EXIT CODES match (2 for a parse error, 0 for --help), and no skill or the " +
      "launchd job ever invokes an invalid command, so the text is not part of C3. " +
      "Reproducing argparse's exact layout would be imitation for its own sake.",
    bugfix: 0,
    expectedDiff: "stderr wording on an unknown command or missing argument",
  },
  {
    reason:
      "A present-but-MALFORMED registry.toml now exits 1 with a readable message " +
      "instead of Python's uncaught tomllib.TOMLDecodeError traceback. Part of the " +
      "same fail-open reasoning as bug-fix #9. No parity case exercises it (the " +
      "fixture registry is always absent or well-formed).",
    bugfix: 9,
    expectedDiff:
      "with a corrupt registry.toml, Python prints a traceback; TypeScript prints " +
      "one line and exits 1",
  },
  {
    reason:
      "Frontmatter is parsed with a real YAML parser instead of the PoC's two " +
      "hand-rolled line-splitters, so list and multiline frontmatter (`tags:` as a " +
      "YAML sequence) now parse correctly instead of being read as a raw string. " +
      "A malformed block still falls back to the old line-splitting behavior, so " +
      "invalid vault files degrade identically. Affects note tags -> the `tags` FTS " +
      "column -> retrieval for notes using list-form tags.",
    bugfix: 5,
    expectedDiff:
      "search/notes output may differ for notes whose frontmatter uses list-form " +
      "or multiline `tags:`",
  },
  {
    reason:
      "A malformed numeric CCMEM_* env var (e.g. CCMEM_BLOCK_AFTER=nonsense) falls " +
      "back to its documented default instead of crashing. The Python reads these " +
      "as import-time module constants via bare int()/float(), so a bad value kills " +
      "the hook process BEFORE main()'s try/except — a latent violation of the " +
      "fail-open invariant (#3). Only reachable with already-broken input.",
    bugfix: 9,
    expectedDiff:
      "with a malformed CCMEM_* value, Python exits non-zero with a traceback; " +
      "TypeScript runs normally using the default",
  },
];

export function findDivergence(
  caseName: string,
  allowlist: readonly Divergence[] = DIVERGENCES,
): Divergence | undefined {
  return allowlist.find((divergence) => divergence.case === caseName);
}
