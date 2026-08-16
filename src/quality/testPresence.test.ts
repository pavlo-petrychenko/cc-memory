import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Every implementation file has a test sitting beside it.
 *
 * This exists because a coverage percentage cannot enforce it: Bun only instruments
 * modules that some test imports, so a file with no test at all is invisible to the
 * threshold rather than counted as zero. A structural check is both cheaper and
 * stricter — it notices the absence itself.
 *
 * `gateways/` is exempt by design. Its adapters are the thinnest possible wrappers over
 * Bun and node APIs, and testing them means asserting that the standard library works.
 * The four that encode a real decision — FTS5 availability, git's non-zero exit becoming
 * an empty string, a missing binary becoming exit 127, log rotation — are tested on
 * purpose, and those tests exist.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

const IMPLEMENTATION_SUFFIXES = [
  ".service.ts",
  ".command.ts",
  ".hook.ts",
  ".parser.ts",
  ".serializer.ts",
  ".formatter.ts",
  ".builder.ts",
  ".ranker.ts",
  ".utils.ts",
];

/**
 * Files exercised thoroughly through a caller rather than directly, where a sibling
 * test would duplicate that coverage. Each entry is a deliberate decision, not a
 * backlog: keeping them listed here means the rule stays true and every exception is
 * visible in review.
 */
const COVERED_THROUGH_CALLERS: ReadonlyMap<string, string> = new Map([
  [
    "core/transport/hook/payload.parser.ts",
    "every field it parses is asserted through the five hook contract tests, which feed real payloads",
  ],
  [
    "modules/installation/steps/shim/shim.repository.ts",
    "the shim's exact contents are asserted by the installer's own end-to-end tests",
  ],
  [
    "modules/installation/utils/jsonFile/jsonFile.repository.ts",
    "read/write behavior is asserted through settings.service and manifest.service, which are its only callers",
  ],
]);

test("every implementation file outside gateways/ has a test beside it", () => {
  const allFiles = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)];
  const testFiles = new Set(allFiles.filter((path) => path.endsWith(".test.ts")));

  const implementationFiles = allFiles.filter((path) => {
    if (path.endsWith(".test.ts")) return false;
    if (path.startsWith("testing/") || path.startsWith("quality/")) return false;
    if (path.startsWith("gateways/")) return false;
    return IMPLEMENTATION_SUFFIXES.some((suffix) => path.endsWith(suffix));
  });

  // Guard against the rule silently covering nothing.
  expect(implementationFiles.length).toBeGreaterThan(40);

  const missing = implementationFiles
    .filter((path) => !testFiles.has(path.replace(/\.ts$/u, ".test.ts")))
    .filter((path) => !COVERED_THROUGH_CALLERS.has(path))
    .toSorted();

  expect(missing).toEqual([]);
});

test("the exception list has no stale entries", () => {
  const allFiles = new Set(new Glob("**/*.ts").scanSync(SOURCE_ROOT));

  const stale = [...COVERED_THROUGH_CALLERS.keys()]
    .filter(
      (path) => !allFiles.has(path) || allFiles.has(path.replace(/\.ts$/u, ".test.ts")),
    )
    .toSorted();

  expect(stale).toEqual([]);
});
