import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { buildFixtureVault, type FixtureVault } from "../fixtures/vault.ts";
import { ensureDistBuilt } from "../helpers/build.ts";
import { createTempDir, type TempDir } from "../helpers/tempdir.ts";
import { runPython, runTs } from "./harness.ts";

/**
 * `doctor` is the one command with no whole-output parity case: Python's
 * `cmd_doctor` (bin/memory:212-250) spawns the five hook scripts and reports their
 * exit codes, whereas the TypeScript one is an intentional redesign into real
 * diagnostics (see tests/parity/cases/cli.ts's closing comment for why).
 *
 * The redesign nonetheless keeps the FIRST TWO LINES byte-identical, because those
 * are what a human reads first and what the old output led with:
 *
 *     registry: <path> (ok|empty)
 *     cwd <path> -> <workspace id|no workspace>
 *
 * This test pins exactly that much against the real Python, so the redesign cannot
 * quietly drift on the part that was kept. Everything below those two lines is
 * covered by tests/integration/services/install/doctorService.test.ts.
 */
function firstTwoLines(stdout: string): readonly string[] {
  return stdout.split("\n").slice(0, 2);
}

describe("doctor — the two frozen lines match Python byte-for-byte", () => {
  let tempDir: TempDir;
  let fixture: FixtureVault;

  beforeAll(() => {
    // Must build here rather than relying on another test file having done it —
    // bun test gives no cross-file ordering guarantee, and this test passed locally
    // off a stale dist/ while failing in CI's clean checkout.
    ensureDistBuilt();
    tempDir = createTempDir("parity-doctor");
    fixture = buildFixtureVault(tempDir.path);
  });

  afterAll(() => {
    tempDir.remove();
  });

  test("inside a registered workspace", async () => {
    const cwd = fixture.workspaces[0]?.projectDir ?? fixture.root;
    const options = { cwd, env: fixture.env };

    const python = await runPython(["doctor"], options);
    const typescript = await runTs(["doctor"], options);

    expect(firstTwoLines(typescript.stdout)).toEqual(firstTwoLines(python.stdout));
    expect(typescript.exitCode).toBe(python.exitCode);
    // Guard against the assertion passing vacuously on two empty outputs.
    expect(firstTwoLines(python.stdout)[0]).toContain("registry:");
    expect(firstTwoLines(python.stdout)[1]).toContain("->");
  });

  test("outside any workspace", async () => {
    const options = { cwd: fixture.outsideDir, env: fixture.env };

    const python = await runPython(["doctor"], options);
    const typescript = await runTs(["doctor"], options);

    expect(firstTwoLines(typescript.stdout)).toEqual(firstTwoLines(python.stdout));
    expect(typescript.exitCode).toBe(python.exitCode);
    expect(firstTwoLines(python.stdout)[1]).toContain("no workspace");
  });

  test("with --prompt, which changes neither of the two lines", async () => {
    const cwd = fixture.workspaces[0]?.projectDir ?? fixture.root;
    const options = { cwd, env: fixture.env };
    const args = ["doctor", "--prompt", "how does wrap-gate work"];

    const python = await runPython(args, options);
    const typescript = await runTs(args, options);

    expect(firstTwoLines(typescript.stdout)).toEqual(firstTwoLines(python.stdout));
  });
});
