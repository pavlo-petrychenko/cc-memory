import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

/** Builds `dist/memory.js` and `dist/ccMemoryExtension.js` so tests can spawn
 * the real CLI and the installer can copy the real bridge. Every test that
 * depends on either MUST call this in its own `beforeAll` — bun test gives no
 * ordering guarantee across files, so a stale `dist/` passes locally and fails
 * in CI. */
export function ensureDistBuilt(): void {
  const builds: string[][] = [
    ["bun", "build", "src/cli/main.ts", "--target=bun", "--outfile", "dist/memory.js"],
    [
      "bun",
      "build",
      "src/piBridge/main.ts",
      "--target=node",
      "--format=esm",
      "--outfile",
      "dist/ccMemoryExtension.js",
    ],
  ];
  for (const command of builds) {
    const build = Bun.spawnSync(command, {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (build.exitCode !== 0) {
      throw new Error(`bun build failed:\n${build.stderr.toString()}`);
    }
  }
}
