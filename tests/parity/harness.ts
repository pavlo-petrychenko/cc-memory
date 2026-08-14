/**
 * Differential parity harness: run the PYTHON implementation (and, once it
 * exists, the TypeScript one) against identical inputs and diff the results.
 *
 * Built and self-validated (tests/parity/self.test.ts) BEFORE any TypeScript
 * exists, so its correctness never depends on a port being finished — see
 * the plan doc's "testing" and "packet-1-parity" sections.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { spawn } from "bun";

import type { FixtureVault } from "../fixtures/vault.ts";
import type { TreeEntry } from "../helpers/tempdir.ts";
import { type Divergence, DIVERGENCES, findDivergence } from "./divergences.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const MEMORY_CLI_PATH = join(REPO_ROOT, "src", "bin", "memory");
const DIST_ENTRYPOINT = join(REPO_ROOT, "dist", "memory.js");
const DEFAULT_TIMEOUT_MS = 15_000;

/** The five Claude Code hook scripts under src/hooks/ — see CLAUDE.md's C2 contract. */
export enum HookScript {
  SessionStart = "session-start.py",
  MemoryInject = "memory-inject.py",
  WrapGate = "wrap-gate.py",
  WorklogFloor = "worklog-floor.py",
  CompactCheckpoint = "compact-checkpoint.py",
}

/** Field names match the hook stdin JSON contract (C2) verbatim, so they are
 * intentionally snake_case rather than the repo's usual camelCase. */
export type HookPayload = {
  readonly cwd?: string;
  readonly session_id?: string;
  readonly source?: string;
  readonly prompt?: string;
  readonly stop_hook_active?: boolean;
  readonly compact_summary?: string;
  readonly reason?: string;
  readonly trigger?: string;
};

export type ProcessResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type RunOptions = {
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin?: string;
  readonly timeoutMs?: number;
};

async function spawnAndCollect(
  command: readonly string[],
  options: RunOptions,
): Promise<ProcessResult> {
  const child = spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (options.stdin !== undefined && child.stdin !== undefined) {
    child.stdin.write(options.stdin);
    child.stdin.end();
  }
  const timeoutHandle = setTimeout(
    () => child.kill(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timeoutHandle);
  return { stdout, stderr, exitCode };
}

/** Run `python3 <repo>/src/bin/memory <args>` — the C3 CLI surface. */
export async function runPython(
  args: readonly string[],
  options: RunOptions,
): Promise<ProcessResult> {
  return spawnAndCollect(["python3", MEMORY_CLI_PATH, ...args], options);
}

/**
 * Run one of the 5 hook scripts directly (the Python side has no unifying
 * `memory hook <name>` entrypoint — that is a TS-only addition, see the
 * plan's "contracts" doc). The payload is fed as JSON on stdin per C2.
 */
export async function runPythonHook(
  hookScript: HookScript,
  payload: HookPayload,
  options: RunOptions,
): Promise<ProcessResult> {
  const hookPath = join(REPO_ROOT, "src", "hooks", hookScript);
  return spawnAndCollect(["python3", hookPath], {
    ...options,
    stdin: JSON.stringify(payload),
  });
}

const NOT_BUILT_YET_MESSAGE =
  "cc-memory: dist/memory.js has not been built yet (the TypeScript port is still in " +
  "progress). Build src/cli/main.ts to dist/memory.js before running parity against it.";

/**
 * Run `bun <repo>/dist/memory.js <args>` — the same argv shape as
 * `runPython`, plus (per the plan's C3 "two deliberate additions") `["hook",
 * name]` once P7 lands, so a hook case can target this runner too. Until
 * `dist/memory.js` exists, this fails closed with a clear message instead of
 * a raw spawn/ENOENT error — see packet-1-parity's "done when" line.
 */
export async function runTs(
  args: readonly string[],
  options: RunOptions,
): Promise<ProcessResult> {
  if (!existsSync(DIST_ENTRYPOINT)) {
    return { stdout: "", stderr: NOT_BUILT_YET_MESSAGE, exitCode: 1 };
  }
  return spawnAndCollect(["bun", DIST_ENTRYPOINT, ...args], options);
}

export type CliStep = {
  readonly buildArgs: (fixture: FixtureVault) => readonly string[];
  readonly cwd: (fixture: FixtureVault) => string;
};

export type CliCase = {
  readonly name: string;
  readonly orderInsensitiveStdout: boolean;
  /** Filesystem setup beyond what buildFixtureVault already did (e.g.
   * dirtying a KB file before a `commit` case). A no-op for cases that need
   * nothing extra. Runs once, before the first step. */
  readonly prepare: (fixture: FixtureVault) => void;
  readonly steps: readonly CliStep[];
};

type CliRunner = (args: readonly string[], options: RunOptions) => Promise<ProcessResult>;

function formatTranscriptEntry(header: string, result: ProcessResult): string {
  return (
    `${header}\n${result.stdout}` +
    `--- stderr ---\n${result.stderr}` +
    `--- exit ${result.exitCode} ---`
  );
}

/**
 * Run every step of a CLI case, in order, against one fixture, and return a
 * single transcript (argv + stdout + stderr + exit code per step) for the
 * differ to compare. Steps run in sequence because most CLI commands are
 * stateful (workspace add before search/notes/reindex, etc).
 */
export async function runCliSteps(
  cliCase: CliCase,
  fixture: FixtureVault,
  runner: CliRunner,
): Promise<string> {
  cliCase.prepare(fixture);
  const steps = cliCase.steps;
  // Steps run strictly in sequence (not Promise.all) because most CLI
  // commands are stateful — workspace add must land before search/notes/
  // reindex read the registry it wrote. `reduce` over an accumulator promise
  // keeps that ordering without an `await` literally inside a loop body.
  const transcriptEntries = await steps.reduce<Promise<readonly string[]>>(
    async (previousEntriesPromise, step) => {
      const previousEntries = await previousEntriesPromise;
      const args = step.buildArgs(fixture);
      const result = await runner(args, { env: fixture.env, cwd: step.cwd(fixture) });
      return [
        ...previousEntries,
        formatTranscriptEntry(`$ memory ${args.join(" ")}`, result),
      ];
    },
    Promise.resolve([]),
  );
  return transcriptEntries.join("\n\n");
}

export type HookInvocation = {
  readonly buildPayload: (fixture: FixtureVault) => HookPayload;
  readonly cwd: (fixture: FixtureVault) => string;
};

export type HookCase = {
  readonly name: string;
  readonly hookScript: HookScript;
  /** memory-inject.py searches an index that only session-start.py builds as
   * a side effect; a hook case invoked in isolation needs one built first. */
  readonly requiresIndexBuild: boolean;
  /** Filesystem setup a case needs beyond what buildFixtureVault already did
   * (e.g. dirtying the project repo for a wrap-gate happy-path case). A
   * no-op for cases that need nothing extra. */
  readonly prepare: (fixture: FixtureVault) => void;
  /**
   * One or more payloads run in sequence against the same fixture — most
   * cases send exactly one, but wrap-gate's escalation-to-block behavior
   * (bin/memory reference doc: BLOCK_AFTER nudges + BLOCK_DRIFT dirty files)
   * only appears on a SECOND invocation with the same work signature.
   */
  readonly invocations: readonly HookInvocation[];
};

async function buildIndexForHookCase(fixture: FixtureVault): Promise<void> {
  await runPython(["reindex"], { env: fixture.env, cwd: fixture.root });
}

/** Run one hook case's invocation(s) through the Python hook script, in
 * sequence, and return a transcript in the same shape as runCliSteps. */
export async function runPythonHookCase(
  hookCase: HookCase,
  fixture: FixtureVault,
): Promise<string> {
  if (hookCase.requiresIndexBuild) {
    await buildIndexForHookCase(fixture);
  }
  hookCase.prepare(fixture);
  const transcriptEntries = await hookCase.invocations.reduce<Promise<readonly string[]>>(
    async (previousEntriesPromise, invocation) => {
      const previousEntries = await previousEntriesPromise;
      const payload = invocation.buildPayload(fixture);
      const result = await runPythonHook(hookCase.hookScript, payload, {
        env: fixture.env,
        cwd: invocation.cwd(fixture),
      });
      return [
        ...previousEntries,
        formatTranscriptEntry(
          `$ ${hookCase.hookScript} <<< ${JSON.stringify(payload)}`,
          result,
        ),
      ];
    },
    Promise.resolve([]),
  );
  return transcriptEntries.join("\n\n");
}

const TMP_PLACEHOLDER = "<TMP>";

/**
 * Known-volatile fields masked to a fixed placeholder before comparison:
 * wall-clock timestamps that legitimately differ between two runs of
 * IDENTICAL code (wrap-gate's marker `ts`, memory-inject's log `ts`), so raw
 * comparison would be a false positive rather than a real behavior diff.
 */
function maskVolatileTimestamps(text: string): string {
  return text
    .replaceAll(/"ts":\s*"[^"]*"/gu, '"ts":"<TS>"')
    .replaceAll(/"ts":\s*-?\d+(?:\.\d+)?/gu, '"ts":"<TS>"');
}

/**
 * Round the only floats our outputs ever carry — BM25 `score`/`rank_score`
 * (and inject.jsonl's abbreviated `s`) — to 4dp. Python already rounds these
 * itself before writing inject.jsonl, so for python-vs-python this is a
 * no-op; it matters once a TS run's floating point formatting is compared
 * against Python's (C7).
 */
function roundFloatScores(text: string): string {
  return text.replaceAll(
    /"(score|rank_score|s)":\s*(-?\d+\.\d+)/gu,
    (_wholeMatch, fieldName: string, rawNumber: string) =>
      `"${fieldName}":${Number.parseFloat(rawNumber).toFixed(4)}`,
  );
}

/**
 * Normalize one side's text before comparison: strip its own temp-dir prefix
 * to a shared placeholder (each side has a different absolute path even
 * though the fixture content is identical), then apply the two explicit,
 * named masking rules above. Deliberately minimal — anything not listed here
 * is compared byte-for-byte.
 */
export function normalizeText(text: string, temporaryRoot: string): string {
  const withoutTempRoot = text.split(temporaryRoot).join(TMP_PLACEHOLDER);
  return roundFloatScores(maskVolatileTimestamps(withoutTempRoot));
}

/** Sort output lines for the handful of CLI outputs whose row order is not
 * itself part of the contract (e.g. `workspace ls`). Opt-in per case via
 * `CliCase.orderInsensitiveStdout` — most output (search results ranked by
 * score) is order-SIGNIFICANT and must never be sorted away. */
export function sortLines(text: string): string {
  return text.split("\n").toSorted().join("\n");
}

function normalizeTree(
  tree: readonly TreeEntry[],
  temporaryRoot: string,
): readonly TreeEntry[] {
  return tree
    .map((entry) => ({
      relativePath: entry.relativePath,
      contents: normalizeText(entry.contents, temporaryRoot),
    }))
    .toSorted((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export type ParityMismatch = {
  readonly kind: "stdout" | "file-tree";
  readonly detail: string;
};

function describeTreeDiff(
  left: readonly TreeEntry[],
  right: readonly TreeEntry[],
): string | null {
  const leftByPath = new Map(left.map((entry) => [entry.relativePath, entry.contents]));
  const rightByPath = new Map(right.map((entry) => [entry.relativePath, entry.contents]));
  const allPaths = new Set([...leftByPath.keys(), ...rightByPath.keys()]);
  const differences: string[] = [];
  for (const path of [...allPaths].toSorted()) {
    const leftContents = leftByPath.get(path);
    const rightContents = rightByPath.get(path);
    if (leftContents === undefined) {
      differences.push(`+ ${path} (present only on the right)`);
    } else if (rightContents === undefined) {
      differences.push(`- ${path} (present only on the left)`);
    } else if (leftContents !== rightContents) {
      differences.push(
        `~ ${path}\n    left:  ${leftContents}\n    right: ${rightContents}`,
      );
    }
  }
  return differences.length === 0 ? null : differences.join("\n");
}

/**
 * Compare one case's two sides — each a transcript string plus its fixture's
 * file-tree snapshot (tests/helpers/tempdir.ts snapshotTree of the fixture
 * root, taken after the run). Returns every mismatch found; an empty result
 * means the two sides are identical after normalization.
 */
export function compareRuns(
  leftTranscript: string,
  leftTree: readonly TreeEntry[],
  leftTemporaryRoot: string,
  rightTranscript: string,
  rightTree: readonly TreeEntry[],
  rightTemporaryRoot: string,
  orderInsensitiveStdout: boolean,
): readonly ParityMismatch[] {
  const mismatches: ParityMismatch[] = [];

  const normalizeStdout = (text: string, root: string): string => {
    const normalized = normalizeText(text, root);
    return orderInsensitiveStdout ? sortLines(normalized) : normalized;
  };
  const leftStdout = normalizeStdout(leftTranscript, leftTemporaryRoot);
  const rightStdout = normalizeStdout(rightTranscript, rightTemporaryRoot);
  if (leftStdout !== rightStdout) {
    mismatches.push({
      kind: "stdout",
      detail: `left:\n${leftStdout}\n---\nright:\n${rightStdout}`,
    });
  }

  const treeDiff = describeTreeDiff(
    normalizeTree(leftTree, leftTemporaryRoot),
    normalizeTree(rightTree, rightTemporaryRoot),
  );
  if (treeDiff !== null) {
    mismatches.push({ kind: "file-tree", detail: treeDiff });
  }

  return mismatches;
}

/**
 * The differ's allowlist-aware verdict (packet-1-parity's "the differ must
 * fail on an unexpected diff AND fail on a missing expected diff"). Throws
 * with a descriptive message on either failure mode so a `bun:test` `test()`
 * block just needs to call this — no separate assertion required.
 */
export function assertParity(
  caseName: string,
  mismatches: readonly ParityMismatch[],
  allowlist: readonly Divergence[] = DIVERGENCES,
): void {
  const divergence = findDivergence(caseName, allowlist);
  if (mismatches.length === 0) {
    if (divergence !== undefined) {
      throw new Error(
        `case "${caseName}": divergences.ts allowlists "${divergence.expectedDiff}" ` +
          `(bugfix #${divergence.bugfix}: ${divergence.reason}) but this run produced no ` +
          "diff at all. Remove the stale allowlist entry.",
      );
    }
    return;
  }
  if (divergence === undefined) {
    const detail = mismatches
      .map((mismatch) => `[${mismatch.kind}]\n${mismatch.detail}`)
      .join("\n\n");
    throw new Error(
      `case "${caseName}": unexpected parity diff, not in divergences.ts:\n\n${detail}`,
    );
  }
  // A registered divergence covers this case; the diff itself is expected.
}
