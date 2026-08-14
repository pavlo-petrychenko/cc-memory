import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/**
 * Build `dist/memory.js` so a test can spawn the real CLI.
 *
 * Every test that shells out to the built artifact MUST call this in its own
 * `beforeAll`, rather than relying on another test file having built it: bun test
 * gives no ordering guarantee across files, and a developer's tree usually has a
 * stale `dist/` lying around from an earlier `bun run build`. A test that skipped
 * this passed locally and failed only in CI's clean checkout, where `runTs`
 * correctly returned its "not built yet" stub and every comparison mismatched.
 *
 * Building is idempotent and takes ~100 ms, so calling it from several files costs
 * nothing meaningful.
 */
export function ensureDistBuilt(): void {
  const build = Bun.spawnSync(
    ["bun", "build", "src/cli/main.ts", "--target=bun", "--outfile", "dist/memory.js"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) {
    throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
  }
}
