/**
 * TS-vs-Python parity: run the TypeScript CLI (`dist/memory.js`, built fresh
 * in `beforeAll`) against the same fixture as the PYTHON `bin/memory`, and
 * assert the two are identical after normalization — the actual cutover-
 * readiness check `tests/parity/self.test.ts` was built to prepare for (see
 * that file's doc comment and the plan's "packet-1-parity"/"testing" docs).
 *
 * A handful of CLI_CASES exercise `reflect`/`doctor`, whose FULL behavior
 * depends on packets that haven't landed yet (P8's real reflector, P7's
 * hooks) — `src/cli/commands/reflect.command.ts` and `doctor.command.ts` are
 * deliberate, documented stubs for the parts only those packets can finish.
 * Those specific cases are called out below with `test.skip` and a comment
 * naming exactly what's missing; every other CLI case (workspace, resolve,
 * reindex, search, notes, commit) is fully ported and asserted for real.
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { buildFixtureVault, type FixtureVault } from "../fixtures/vault.ts";
import { createTempDir, snapshotTree, type TempDir } from "../helpers/tempdir.ts";
import { CLI_CASES } from "./cases/cli.ts";
import { assertParity, compareRuns, runCliSteps, runPython, runTs } from "./harness.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

/**
 * CLI cases whose PYTHON side genuinely does something this packet's TS
 * command deliberately does not (yet) — see the doc comments on
 * `reflect.command.ts` (P8: candidate gathering, `is_due`, the LLM decision
 * step) and `doctor.command.ts` (P7: the 5 real hook scripts Python's doctor
 * spawns and reports on). Every one of these is a STUB producing an honest
 * "not implemented" message, never a silent/incorrect success — see this
 * packet's final report for the exact reasoning. Revisit (delete rows) as P7
 * and P8 land.
 */
const PENDING_PACKET_CASES: ReadonlySet<string> = new Set([
  "cli/reflect-no-candidates-headless",
  "cli/reflect-if-due-skips-second-run",
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
