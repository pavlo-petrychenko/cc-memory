import { join } from "node:path";

import { spawn } from "bun";

/**
 * Spawn the built CLI and normalize its output, for the end-to-end tests that compare
 * against the golden files under `testing/golden/`.
 *
 * Normalization is deliberately minimal: the temp-directory prefix becomes a
 * placeholder, the two genuinely volatile timestamps are masked, and float scores are
 * rounded. Anything more would start hiding real output differences, which defeats the
 * point of comparing against a golden.
 *
 * Callers must have run `ensureDistBuilt()` first.
 */
const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const DIST_ENTRYPOINT = join(REPO_ROOT, "dist", "memory.js");
const DEFAULT_TIMEOUT_MS = 15_000;
const TMP_PLACEHOLDER = "<TMP>";

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

export async function runBuiltCli(
  args: readonly string[],
  options: RunOptions,
): Promise<ProcessResult> {
  const child = spawn(["bun", DIST_ENTRYPOINT, ...args], {
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

/** Wall-clock timestamps, which are never stable between two runs. */
function maskVolatileTimestamps(text: string): string {
  return text
    .replaceAll(/"ts":\s*"[^"]*"/gu, '"ts":"<TS>"')
    .replaceAll(/"ts":\s*-?\d+(?:\.\d+)?/gu, '"ts":"<TS>"');
}

/** Round the only floats these outputs carry — BM25 `score`/`rank_score`, and the
 * abbreviated `s` in inject.jsonl — so last-digit noise never fails a comparison. */
function roundFloatScores(text: string): string {
  return text.replaceAll(
    /"(score|rank_score|s)":\s*(-?\d+\.\d+)/gu,
    (_wholeMatch, fieldName: string, rawNumber: string) =>
      `"${fieldName}":${Number.parseFloat(rawNumber).toFixed(4)}`,
  );
}

export function normalizeText(text: string, temporaryRoot: string): string {
  const withoutTempRoot = text.split(temporaryRoot).join(TMP_PLACEHOLDER);
  return roundFloatScores(maskVolatileTimestamps(withoutTempRoot));
}
