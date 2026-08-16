import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * One `CLAUDE.md` per module root, nowhere else, H1 equal to its own path,
 * and no longer than 20 lines. The "H1 equals its own path" check is what makes
 * a stale doc — one copied from another directory — fail loudly instead of
 * quietly describing the wrong module.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

function moduleRootOf(path: string): string {
  const segments = path.split("/");
  if (segments[0] === "modules" && segments[1] !== undefined) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] ?? path;
}

test("every module root has a CLAUDE.md, nowhere else, H1 = its own path, <= 20 lines", async () => {
  const tsPaths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)];
  const mdPaths = [...new Glob("**/CLAUDE.md").scanSync(SOURCE_ROOT)];

  const moduleRoots = new Set(
    tsPaths
      .filter(
        (path) =>
          !path.startsWith("testing/") &&
          !path.startsWith("skills/") &&
          path !== "version.ts" &&
          path !== "version.test.ts" &&
          path !== "registry.wiring.ts",
      )
      .map(moduleRootOf),
  );
  // Guard against the rule silently covering nothing.
  expect(moduleRoots.size).toBeGreaterThan(5);

  const mdRoots = new Set(mdPaths.map(moduleRootOf));

  const missing = [...moduleRoots].filter((root) => !mdRoots.has(root)).toSorted();
  expect(missing).toEqual([]);

  const nested = mdPaths
    .filter((path) => !moduleRoots.has(moduleRootOf(path)))
    .toSorted();
  expect(nested).toEqual([]);

  const contents = await Promise.all(
    mdPaths.map(async (mdPath) => ({
      mdPath,
      text: await Bun.file(SOURCE_ROOT + mdPath).text(),
    })),
  );

  for (const { mdPath, text } of contents) {
    const lines = text.split("\n");
    expect(lines.length, mdPath).toBeLessThanOrEqual(20);
    expect(lines[0], mdPath).toBe(`# ${moduleRootOf(mdPath)}`);
  }
});
