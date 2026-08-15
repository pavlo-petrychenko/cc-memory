import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

/** Builds `dist/memory.js` so a test can spawn the real CLI. Every test that shells
 * out to it MUST call this in its own `beforeAll` — bun test gives no ordering
 * guarantee across files, so a stale `dist/` passes locally and fails in CI. */
export function ensureDistBuilt(): void {
  const build = Bun.spawnSync(
    ["bun", "build", "src/cli/main.ts", "--target=bun", "--outfile", "dist/memory.js"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) {
    throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
  }
}
