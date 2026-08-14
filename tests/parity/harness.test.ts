/**
 * Unit tests for the harness's pure pieces (normalizer + differ) and the
 * runTs "not built yet" / "built" branches. self.test.ts is Python-vs-Python
 * and always green, so it never exercises the differ's FAILURE paths — this
 * file does, with synthetic data instead of spawned processes.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { TreeEntry } from "../helpers/tempdir.ts";
import type { Divergence } from "./divergences.ts";
import { assertParity, compareRuns, normalizeText, runTs, sortLines } from "./harness.ts";

describe("normalizeText", () => {
  test("strips every occurrence of the temp root to a shared placeholder", () => {
    const text =
      "kb: /tmp/fixture-abc/vault\nworklogs: /tmp/fixture-abc/vault/_Worklogs\n";
    expect(normalizeText(text, "/tmp/fixture-abc")).toBe(
      "kb: <TMP>/vault\nworklogs: <TMP>/vault/_Worklogs\n",
    );
  });

  test("masks a wrap-gate marker's quoted epoch-float ts field", () => {
    const marker = '{"sig": "abc123:5", "ts": 1737000000.123456, "nudges": 1}';
    expect(normalizeText(marker, "/unused")).toBe(
      '{"sig": "abc123:5", "ts":"<TS>", "nudges": 1}',
    );
  });

  test("masks an inject.jsonl row's quoted ISO ts field", () => {
    const row = '{"ts": "2026-01-01T00:00:00", "ws": "primary"}';
    expect(normalizeText(row, "/unused")).toBe('{"ts":"<TS>", "ws": "primary"}');
  });

  test("rounds score/rank_score/s fields to 4 decimal places", () => {
    const text = '{"score": -1.23456789, "rank_score": 0.1, "s": -2.0}';
    expect(normalizeText(text, "/unused")).toBe(
      '{"score":-1.2346, "rank_score":0.1000, "s":-2.0000}',
    );
  });

  test("leaves unrelated numbers (e.g. an importance field) untouched", () => {
    expect(normalizeText('{"importance": 6}', "/unused")).toBe('{"importance": 6}');
  });
});

describe("sortLines", () => {
  test("sorts lines lexicographically, order-insensitive comparisons only", () => {
    expect(sortLines("charlie\nalpha\nbravo")).toBe("alpha\nbravo\ncharlie");
  });
});

function treeEntry(relativePath: string, contents: string): TreeEntry {
  return { relativePath, contents };
}

describe("compareRuns", () => {
  test("reports no mismatches for identical transcripts and trees", () => {
    const tree: readonly TreeEntry[] = [treeEntry("STATE.md", "# wt1\n")];
    const mismatches = compareRuns(
      "same output",
      tree,
      "/left",
      "same output",
      tree,
      "/right",
      false,
    );
    expect(mismatches).toEqual([]);
  });

  test("reports a stdout mismatch when normalized transcripts differ", () => {
    const mismatches = compareRuns(
      "left says A",
      [],
      "/left",
      "right says B",
      [],
      "/right",
      false,
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.kind).toBe("stdout");
  });

  test("order-insensitive stdout tolerates a pure line reordering", () => {
    const mismatches = compareRuns("a\nb\nc", [], "/left", "c\na\nb", [], "/right", true);
    expect(mismatches).toEqual([]);
  });

  test("reports a file-tree mismatch for a path present on only one side", () => {
    const leftTree: readonly TreeEntry[] = [treeEntry("Alpha/Alpha.md", "content")];
    const rightTree: readonly TreeEntry[] = [];
    const mismatches = compareRuns(
      "same",
      leftTree,
      "/left",
      "same",
      rightTree,
      "/right",
      false,
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.kind).toBe("file-tree");
    expect(mismatches[0]?.detail).toContain("present only on the left");
  });

  test("reports a file-tree mismatch for a path present only on the right", () => {
    const mismatches = compareRuns(
      "same",
      [],
      "/left",
      "same",
      [treeEntry("Alpha/Alpha.md", "content")],
      "/right",
      false,
    );
    expect(mismatches[0]?.detail).toContain("present only on the right");
  });

  test("reports a file-tree mismatch for differing contents at the same path", () => {
    const mismatches = compareRuns(
      "same",
      [treeEntry("STATE.md", "focus: A")],
      "/left",
      "same",
      [treeEntry("STATE.md", "focus: B")],
      "/right",
      false,
    );
    expect(mismatches[0]?.detail).toContain("focus: A");
    expect(mismatches[0]?.detail).toContain("focus: B");
  });

  test("can report both a stdout and a file-tree mismatch for the same case", () => {
    const mismatches = compareRuns(
      "left stdout",
      [treeEntry("a.md", "1")],
      "/left",
      "right stdout",
      [treeEntry("a.md", "2")],
      "/right",
      false,
    );
    expect(mismatches.map((mismatch) => mismatch.kind).toSorted()).toEqual([
      "file-tree",
      "stdout",
    ]);
  });
});

describe("assertParity", () => {
  test("passes silently when there are no mismatches and no allowlist entry", () => {
    expect(() => assertParity("some/case", [], [])).not.toThrow();
  });

  test("throws on an unexpected diff not covered by the allowlist", () => {
    const mismatches = [{ kind: "stdout" as const, detail: "left vs right" }];
    expect(() => assertParity("some/case", mismatches, [])).toThrow(
      /unexpected parity diff/,
    );
  });

  test("passes when a real diff is covered by a matching allowlist entry", () => {
    const allowlist: readonly Divergence[] = [
      {
        case: "some/case",
        reason: "bugfix #1: wrap-state.json replaces per-session markers",
        bugfix: 1,
        expectedDiff: "marker file layout differs",
      },
    ];
    const mismatches = [
      { kind: "file-tree" as const, detail: "marker file layout differs" },
    ];
    expect(() => assertParity("some/case", mismatches, allowlist)).not.toThrow();
  });

  test("throws when an allowlisted case produced no diff at all (stale entry)", () => {
    const allowlist: readonly Divergence[] = [
      {
        case: "some/case",
        reason: "no longer true",
        bugfix: 2,
        expectedDiff: "rotation files appear",
      },
    ];
    expect(() => assertParity("some/case", [], allowlist)).toThrow(
      /stale allowlist entry/,
    );
  });

  test("an allowlist entry for a DIFFERENT case does not mask this case's diff", () => {
    const allowlist: readonly Divergence[] = [
      { case: "other/case", reason: "n/a", bugfix: 3, expectedDiff: "n/a" },
    ];
    const mismatches = [{ kind: "stdout" as const, detail: "diff" }];
    expect(() => assertParity("some/case", mismatches, allowlist)).toThrow(
      /unexpected parity diff/,
    );
  });
});

describe("runTs", () => {
  const distPath = join(new URL("../../", import.meta.url).pathname, "dist", "memory.js");

  test("fails clearly when dist/memory.js does not exist", async () => {
    // Same rationale as self.test.ts's identically-named case: P6's `bun run
    // build` means a real dist/memory.js may already be sitting there from
    // ts.test.ts's beforeAll (same `bun test` process) — remove it here and
    // rebuild afterwards so this file can exercise the "not built yet"
    // fail-closed path without leaving a later file's `runTs` call broken.
    const existedBefore = existsSync(distPath);
    if (existedBefore) rmSync(distPath);
    try {
      const result = await runTs(["workspace", "ls"], { env: {}, cwd: "/" });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not been built yet");
    } finally {
      if (existedBefore) {
        Bun.spawnSync(
          [
            "bun",
            "build",
            "src/cli/main.ts",
            "--target=bun",
            "--outfile",
            "dist/memory.js",
          ],
          { cwd: new URL("../../", import.meta.url).pathname },
        );
      }
    }
  });

  test("spawns bun against dist/memory.js once it exists", async () => {
    mkdirSync(dirname(distPath), { recursive: true });
    writeFileSync(
      distPath,
      'console.log("built: " + process.argv.slice(2).join(" "));\n',
      "utf-8",
    );
    try {
      const result = await runTs(["workspace", "ls"], {
        env: { PATH: process.env["PATH"] ?? "" },
        cwd: "/",
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("built: workspace ls");
    } finally {
      rmSync(distPath, { force: true });
    }
  });
});
