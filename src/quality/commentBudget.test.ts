import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Comment lines stay at or below 8% of non-test lines. The number matters: a
 * comment-heavy codebase is one where the code has drifted away from its own
 * documentation, and the hard-won traps belong in the root `CLAUDE.md`, not
 * repeated beside every caller.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}

test("comment lines stay at or below 8% of non-test lines", async () => {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)]
    .filter(
      (path) =>
        !path.endsWith(".test.ts") &&
        !path.startsWith("testing/") &&
        !path.startsWith("quality/"),
    )
    .toSorted();

  // Guard against the rule silently covering nothing.
  expect(paths.length).toBeGreaterThan(100);

  const contents = await Promise.all(
    paths.map(async (path) => await Bun.file(SOURCE_ROOT + path).text()),
  );

  let commentLines = 0;
  let totalLines = 0;
  for (const content of contents) {
    for (const line of content.split("\n")) {
      totalLines += 1;
      if (isCommentLine(line)) commentLines += 1;
    }
  }

  expect(commentLines / totalLines).toBeLessThanOrEqual(0.08);
});
