/**
 * TS-vs-Python parity: run the TypeScript CLI (`dist/memory.js`, built fresh
 * in `beforeAll`) against the same fixture as the PYTHON `bin/memory`, and
 * assert the two are identical after normalization — the actual cutover-
 * readiness check `tests/parity/self.test.ts` was built to prepare for (see
 * that file's doc comment and the plan's "packet-1-parity"/"testing" docs).
 *
 * A handful of `doctor` CLI_CASES still exercise a stub: `doctor.command.ts`
 * is P7's to finish (the 5 real hook scripts Python's doctor spawns and
 * reports on). `reflect` landed with P8 and is asserted for real, including
 * the reworked cursor scheme (bugfix #3 — see `tests/parity/divergences.ts`).
 * Those `doctor` cases are called out below with `test.skip` and a comment
 * naming exactly what's missing; every other CLI case (workspace, resolve,
 * reindex, search, notes, commit, reflect) is fully ported and asserted for
 * real.
 */
import { beforeAll, describe, expect, test } from "bun:test";

import type { JsonValue } from "../../src/hooks/payload.ts";
import { buildFixtureVault, type FixtureVault } from "../fixtures/vault.ts";
import {
  createTempDir,
  snapshotTree,
  type TempDir,
  type TreeEntry,
} from "../helpers/tempdir.ts";
import { CLI_CASES } from "./cases/cli.ts";
import { HOOK_CASES, HOOK_SCRIPT_TO_CLI_NAME } from "./cases/hooks.ts";
import {
  assertParity,
  compareRuns,
  type HookCase,
  type HookPayload,
  runCliSteps,
  runPython,
  runPythonHook,
  type RunOptions,
  runTs,
} from "./harness.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

/**
 * CLI cases whose PYTHON side genuinely does something this packet's TS
 * command deliberately does not (yet) — see the doc comment on
 * `doctor.command.ts` (P7: the 5 real hook scripts Python's doctor spawns
 * and reports on). Every one of these is a STUB producing an honest "not
 * implemented" message, never a silent/incorrect success. Revisit (delete
 * rows) as P7 lands.
 */
const PENDING_PACKET_CASES: ReadonlySet<string> = new Set([
  "cli/doctor-basic",
  "cli/doctor-with-prompt",
  "cli/doctor-outside-workspace",
]);

type FixtureSide = { readonly tempDir: TempDir; readonly fixture: FixtureVault };

function buildFixture(prefix: string): FixtureSide {
  const tempDir = createTempDir(prefix);
  return { tempDir, fixture: buildFixtureVault(tempDir.path) };
}

describe("TS vs Python: CLI cases", () => {
  beforeAll(async () => {
    const build = Bun.spawnSync(
      ["bun", "build", "src/cli/main.ts", "--target=bun", "--outfile", "dist/memory.js"],
      { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
    );
    if (build.exitCode !== 0) {
      throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
    }
  });

  for (const cliCase of CLI_CASES) {
    const runner = PENDING_PACKET_CASES.has(cliCase.name) ? test.skip : test;
    runner(cliCase.name, async () => {
      const python = buildFixture("parity-ts-py");
      const ts = buildFixture("parity-ts-ts");
      try {
        const pythonTranscript = await runCliSteps(cliCase, python.fixture, runPython);
        const tsTranscript = await runCliSteps(cliCase, ts.fixture, runTs);
        const mismatches = compareRuns(
          pythonTranscript,
          snapshotTree(python.fixture.root),
          python.fixture.root,
          tsTranscript,
          snapshotTree(ts.fixture.root),
          ts.fixture.root,
          cliCase.orderInsensitiveStdout,
        );
        assertParity(cliCase.name, mismatches);
      } finally {
        python.tempDir.remove();
        ts.tempDir.remove();
      }
    });
  }

  test("every CLI case is either asserted above or explicitly pending a future packet", () => {
    for (const pendingName of PENDING_PACKET_CASES) {
      expect(CLI_CASES.some((cliCase) => cliCase.name === pendingName)).toBe(true);
    }
  });
});

/**
 * `json.dumps` (Python's default `separators=(", ", ": ")`) and
 * `JSON.stringify` (no separators at all) format the identical JSON value
 * with different, purely cosmetic whitespace — re-parsing and re-serializing
 * compactly canonicalizes that difference away without touching the meaning
 * of anything on either side. Text that ISN'T valid JSON passes through
 * unchanged, so a genuine malformed-output bug still surfaces as a diff
 * instead of silently vanishing. Shared by both the per-invocation stdout
 * (below) and `inject.jsonl` line content (`memory-inject.py:47-48` writes
 * with the same Python default separators this hook's own `JSON.stringify`
 * calls don't reproduce).
 */
function canonicalizeJsonText(text: string): string {
  try {
    const parsed: JsonValue = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

/** Every hook's entire stdout is always either empty or exactly one line of
 * JSON (never pretty-printed by either side) — see `canonicalizeJsonText`. */
function normalizeHookStdout(rawStdout: string): string {
  const trimmed = rawStdout.trim();
  return trimmed === "" ? rawStdout : `${canonicalizeJsonText(trimmed)}\n`;
}

/**
 * `inject.jsonl` is the one hook-written FILE whose content is JSON (one
 * object per line) rather than free text — `describeTreeDiff`
 * (`tests/parity/harness.ts`) compares tree entries byte-for-byte with no
 * JSON-aware normalization of its own, so this canonicalizes each line the
 * same way `normalizeHookStdout` does for stdout, applied to a whole
 * snapshotted tree before it reaches `compareRuns`.
 */
function normalizeJsonlTreeEntries(tree: readonly TreeEntry[]): readonly TreeEntry[] {
  return tree.map((entry) => {
    if (!entry.relativePath.endsWith(".jsonl")) return entry;
    const lines = entry.contents.split("\n").filter((line) => line !== "");
    return {
      relativePath: entry.relativePath,
      contents: `${lines.map(canonicalizeJsonText).join("\n")}\n`,
    };
  });
}

/**
 * Format one hook invocation's transcript entry with a NEUTRAL header shared
 * by both sides (`$ hook <name> <<< <payload>`) — unlike `runPythonHookCase`
 * (`tests/parity/harness.ts`), which bakes in Python's own `<script>.py`
 * invocation shape. The Python side runs a standalone script directly; the
 * TypeScript side runs `memory hook <name>` (C3's additive subcommand) — two
 * genuinely different invocation syntaxes for the same C2 behavior, so
 * comparing raw `runPythonHookCase` output against a `memory hook` transcript
 * would report a header-text mismatch on every single case. Using one
 * hand-written, side-independent header here keeps the comparison honest:
 * only stdout/stderr/exit-code differences ever surface.
 */
function formatHookTranscriptEntry(
  hookLabel: string,
  payload: HookPayload,
  result: { readonly stdout: string; readonly stderr: string; readonly exitCode: number },
): string {
  return (
    `$ hook ${hookLabel} <<< ${JSON.stringify(payload)}\n${normalizeHookStdout(result.stdout)}` +
    `--- stderr ---\n${result.stderr}` +
    `--- exit ${result.exitCode} ---`
  );
}

async function runHookCaseTranscript(
  hookCase: HookCase,
  fixture: FixtureVault,
  hookLabel: string,
  invokeOne: (
    payload: HookPayload,
    options: RunOptions,
  ) => Promise<{
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
  }>,
): Promise<string> {
  hookCase.prepare(fixture);
  const transcriptEntries = await hookCase.invocations.reduce<Promise<readonly string[]>>(
    async (previousEntriesPromise, invocation) => {
      const previousEntries = await previousEntriesPromise;
      const payload = invocation.buildPayload(fixture);
      const result = await invokeOne(payload, {
        env: fixture.env,
        cwd: invocation.cwd(fixture),
      });
      return [...previousEntries, formatHookTranscriptEntry(hookLabel, payload, result)];
    },
    Promise.resolve([]),
  );
  return transcriptEntries.join("\n\n");
}

/**
 * The `Divergence.case` key this describe block registers/looks up for a
 * given `HOOK_CASES` entry — deliberately DIFFERENT from `hookCase.name`
 * itself (used unsuffixed as this file's `test()` title, and as
 * `self.test.ts`'s own `assertParity` lookup key) so a real python-vs-TS
 * divergence entry in `divergences.ts` never collides with
 * `self.test.ts`'s python-vs-python self-consistency check of the identical
 * case — see the comment at the one call site below.
 */
function hookDivergenceCaseName(hookCaseName: string): string {
  return `${hookCaseName} (ts-vs-python)`;
}

describe("TS vs Python: Hook cases", () => {
  beforeAll(() => {
    const build = Bun.spawnSync(
      ["bun", "build", "src/cli/main.ts", "--target=bun", "--outfile", "dist/memory.js"],
      { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
    );
    if (build.exitCode !== 0) {
      throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
    }
  });

  for (const hookCase of HOOK_CASES) {
    test(hookCase.name, async () => {
      const python = buildFixture("parity-hook-py");
      const ts = buildFixture("parity-hook-ts");
      try {
        const hookLabel = HOOK_SCRIPT_TO_CLI_NAME[hookCase.hookScript];
        if (hookCase.requiresIndexBuild) {
          await runPython(["reindex"], {
            env: python.fixture.env,
            cwd: python.fixture.root,
          });
          await runTs(["reindex"], { env: ts.fixture.env, cwd: ts.fixture.root });
        }

        const pythonTranscript = await runHookCaseTranscript(
          hookCase,
          python.fixture,
          hookLabel,
          (payload, options) => runPythonHook(hookCase.hookScript, payload, options),
        );
        const tsTranscript = await runHookCaseTranscript(
          hookCase,
          ts.fixture,
          hookLabel,
          (payload, options) =>
            runTs(["hook", hookLabel], { ...options, stdin: JSON.stringify(payload) }),
        );

        const mismatches = compareRuns(
          pythonTranscript,
          normalizeJsonlTreeEntries(snapshotTree(python.fixture.root)),
          python.fixture.root,
          tsTranscript,
          normalizeJsonlTreeEntries(snapshotTree(ts.fixture.root)),
          ts.fixture.root,
          false,
        );
        // `HOOK_CASES` also drives `self.test.ts`'s Python-vs-Python
        // self-consistency check, via `assertParity(hookCase.name, …)` with
        // the SAME default `DIVERGENCES` array `assertParity` uses here. A
        // registered divergence (bugfix #1's marker-file-layout difference)
        // is real ONLY for a python-vs-TS comparison — a python-vs-python run
        // of the identical case never produces that diff, so `assertParity`
        // would (correctly) flag it there as a stale entry. Suffixing the
        // lookup key used ONLY by this describe block keeps the two checks
        // from colliding over the same `Divergence.case` string, with no
        // change needed to `self.test.ts` (not this packet's file).
        assertParity(hookDivergenceCaseName(hookCase.name), mismatches);
      } finally {
        python.tempDir.remove();
        ts.tempDir.remove();
      }
    });
  }
});
