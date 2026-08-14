import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Bun only instruments modules that a test actually imports. Without this file a
 * module with NO tests at all would be invisible to the coverage threshold rather
 * than counted as 0%, which makes the gate in bunfig.toml gameable by simply not
 * writing tests.
 *
 * Importing every source module closes that hole: an untested file still appears in
 * the report, at 0%, and drags `bun run check` under the threshold.
 *
 * This is also why no module may do work at import time — see CLAUDE.md.
 */
test("every source module is loaded so coverage cannot hide an untested file", async () => {
  const sourceRoot = new URL("../../src/", import.meta.url).pathname;
  const modulePaths = [...new Glob("**/*.ts").scanSync(sourceRoot)].toSorted();

  expect(modulePaths.length).toBeGreaterThan(0);

  await Promise.all(modulePaths.map((modulePath) => import(sourceRoot + modulePath)));
});
