/**
 * Self-parity: run the PYTHON implementation on BOTH sides of every case
 * (CLI, hooks, retrieval replay) and assert zero diffs. This is the
 * validation gate for the harness itself — if this suite is not green, the
 * HARNESS is wrong, not the (nonexistent-yet) TypeScript port. See the plan
 * doc's "packet-1-parity" and "testing" sections.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildFixtureVault, type FixtureVault } from "../fixtures/vault.ts";
import { createTempDir, snapshotTree, type TempDir } from "../helpers/tempdir.ts";
import { CLI_CASES } from "./cases/cli.ts";
import { HOOK_CASES } from "./cases/hooks.ts";
import { RETRIEVAL_CASES } from "./cases/retrieval.ts";
import {
  assertParity,
  type CliCase,
  compareRuns,
  type HookCase,
  runCliSteps,
  runPython,
  runPythonHookCase,
  runTs,
} from "./harness.ts";

type FixturePair = {
  readonly left: { readonly tempDir: TempDir; readonly fixture: FixtureVault };
  readonly right: { readonly tempDir: TempDir; readonly fixture: FixtureVault };
};

/** Build two independent, byte-identical fixture vaults — one per side of a
 * comparison — each in its own temp dir (see tests/helpers/tempdir.ts). Two
 * separate builds are required, not one fixture read twice, so a mutating
 * case (workspace add, reindex, commit) never lets one side see the other's
 * side effects. */
function buildFixturePair(prefix: string): FixturePair {
  const leftTempDir = createTempDir(`${prefix}-left`);
  const rightTempDir = createTempDir(`${prefix}-right`);
  return {
    left: { tempDir: leftTempDir, fixture: buildFixtureVault(leftTempDir.path) },
    right: { tempDir: rightTempDir, fixture: buildFixtureVault(rightTempDir.path) },
  };
}

function removeFixturePair(pair: FixturePair): void {
  pair.left.tempDir.remove();
  pair.right.tempDir.remove();
}

async function assertCliCaseIsSelfConsistent(cliCase: CliCase): Promise<void> {
  const pair = buildFixturePair("parity-cli");
  try {
    const leftTranscript = await runCliSteps(cliCase, pair.left.fixture, runPython);
    const rightTranscript = await runCliSteps(cliCase, pair.right.fixture, runPython);
    const mismatches = compareRuns(
      leftTranscript,
      snapshotTree(pair.left.fixture.root),
      pair.left.fixture.root,
      rightTranscript,
      snapshotTree(pair.right.fixture.root),
      pair.right.fixture.root,
      cliCase.orderInsensitiveStdout,
    );
    assertParity(cliCase.name, mismatches);
  } finally {
    removeFixturePair(pair);
  }
}

async function assertHookCaseIsSelfConsistent(hookCase: HookCase): Promise<void> {
  const pair = buildFixturePair("parity-hook");
  try {
    const leftTranscript = await runPythonHookCase(hookCase, pair.left.fixture);
    const rightTranscript = await runPythonHookCase(hookCase, pair.right.fixture);
    const mismatches = compareRuns(
      leftTranscript,
      snapshotTree(pair.left.fixture.root),
      pair.left.fixture.root,
      rightTranscript,
      snapshotTree(pair.right.fixture.root),
      pair.right.fixture.root,
      false,
    );
    assertParity(hookCase.name, mismatches);
  } finally {
    removeFixturePair(pair);
  }
}

describe("parity harness self-test: CLI cases (Python vs Python)", () => {
  for (const cliCase of CLI_CASES) {
    test(cliCase.name, async () => {
      await assertCliCaseIsSelfConsistent(cliCase);
    });
  }
});

describe("parity harness self-test: hook cases (Python vs Python)", () => {
  for (const hookCase of HOOK_CASES) {
    test(hookCase.name, async () => {
      await assertHookCaseIsSelfConsistent(hookCase);
    });
  }
});

describe("parity harness self-test: retrieval replay (Python vs Python)", () => {
  for (const retrievalCase of RETRIEVAL_CASES) {
    test(retrievalCase.name, async () => {
      await assertHookCaseIsSelfConsistent(retrievalCase);
    });
  }
});

describe("runTs before dist/memory.js exists", () => {
  test("fails cleanly with a clear 'not built yet' message instead of a raw spawn error", async () => {
    // P6 landed `bun run build`, so a real dist/memory.js now legitimately
    // exists whenever tests/parity/ts.test.ts's beforeAll has already run in
    // this same `bun test` process — remove it here (and rebuild afterwards,
    // so ts.test.ts and a plain `memory` invocation aren't left broken) to
    // exercise the pre-P6 "not built yet" fail-closed path in isolation.
    const distPath = join(
      new URL("../../", import.meta.url).pathname,
      "dist",
      "memory.js",
    );
    const existedBefore = existsSync(distPath);
    if (existedBefore) rmSync(distPath);

    const pair = buildFixturePair("parity-runts");
    try {
      const result = await runTs(["workspace", "ls"], {
        env: pair.left.fixture.env,
        cwd: pair.left.fixture.root,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("not been built yet");
      expect(result.stderr).toContain("dist/memory.js");
    } finally {
      removeFixturePair(pair);
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
});

describe("sandbox isolation (CLAUDE.md invariant: the real ~/.claude is never touched)", () => {
  test("a mutating CLI run through the fixture never reads or writes the real registry", async () => {
    const realRegistryPath = join(homedir(), ".claude", "memory", "registry.toml");
    const realRegistryExistedBefore = existsSync(realRegistryPath);
    const realRegistryContentBefore = realRegistryExistedBefore
      ? readFileSync(realRegistryPath, "utf-8")
      : null;

    const tempDir = createTempDir("parity-sandbox");
    try {
      const fixture = buildFixtureVault(tempDir.path);
      expect(fixture.root).not.toBe(homedir());
      expect(fixture.registryPath).not.toBe(realRegistryPath);

      const primary = fixture.workspaces[0];
      if (primary === undefined) throw new Error("fixture built with no workspaces");
      const result = await runPython(
        [
          "workspace",
          "add",
          "sandbox-check",
          "--match",
          join(fixture.root, "projects", "sandbox-check"),
        ],
        { env: fixture.env, cwd: primary.projectDir },
      );
      expect(result.exitCode).toBe(0);

      // The fixture's OWN registry gained the new workspace...
      const fixtureRegistryContent = readFileSync(fixture.registryPath, "utf-8");
      expect(fixtureRegistryContent).toContain("sandbox-check");

      // ...while the REAL registry (if any) is byte-identical to before.
      const realRegistryExistedAfter = existsSync(realRegistryPath);
      expect(realRegistryExistedAfter).toBe(realRegistryExistedBefore);
      if (realRegistryExistedAfter && realRegistryContentBefore !== null) {
        expect(readFileSync(realRegistryPath, "utf-8")).toBe(realRegistryContentBefore);
      }
    } finally {
      tempDir.remove();
    }
  });
});
