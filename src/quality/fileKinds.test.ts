import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * The file-kind rules from CLAUDE.md, enforced.
 *
 * The naming scheme only helps if it is true: a `*.typedefs.ts` that also holds a
 * function, or a constant sitting inline in a service, puts the reader back to opening
 * files to find out what is in them. These tests are cheap and they fail loudly the
 * moment a module drifts back toward mixing kinds.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

/** Tests, fixtures and fakes are exempt: they are not production modules. */
function isProductionFile(modulePath: string): boolean {
  if (modulePath.endsWith(".test.ts")) return false;
  return !modulePath.startsWith("testing/") && !modulePath.startsWith("quality/");
}

async function readProductionFiles(
  predicate: (path: string) => boolean,
): Promise<ReadonlyMap<string, string>> {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)]
    .filter(isProductionFile)
    .filter(predicate)
    .toSorted();
  const entries = await Promise.all(
    paths.map(async (path) => [path, await Bun.file(SOURCE_ROOT + path).text()] as const),
  );
  return new Map(entries);
}

const FUNCTION_DECLARATION = /^\s*(?:export\s+)?(?:async\s+)?function\s/m;
const ARROW_FUNCTION_EXPORT =
  /^\s*export\s+const\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?\(/m;
/**
 * A declaration file may only hold literal values — never derive one from another
 * at module scope. `settings.constants.ts` once computed `HOOK_REGISTRATION_ORDER`
 * via `hookRegistrations.map(...)`, which runs on every import and hides the actual
 * emitted values behind a transform the reader has to execute mentally.
 */
const MODULE_SCOPE_ARRAY_METHOD = /\.(?:map|filter|reduce)\(/;

test("a *.typedefs.ts file declares only types, never behavior", async () => {
  const files = await readProductionFiles((path) => path.endsWith(".typedefs.ts"));
  expect(files.size).toBeGreaterThan(0);

  const violations: string[] = [];
  for (const [path, text] of files) {
    if (FUNCTION_DECLARATION.test(text)) violations.push(`${path}: function declaration`);
    if (ARROW_FUNCTION_EXPORT.test(text))
      violations.push(`${path}: exported arrow function`);
    if (MODULE_SCOPE_ARRAY_METHOD.test(text))
      violations.push(`${path}: module-scope .map/.filter/.reduce call`);
  }
  expect(violations).toEqual([]);
});

test("a *.constants.ts file declares only values, never behavior", async () => {
  const files = await readProductionFiles((path) => path.endsWith(".constants.ts"));
  expect(files.size).toBeGreaterThan(0);

  const violations: string[] = [];
  for (const [path, text] of files) {
    if (FUNCTION_DECLARATION.test(text)) violations.push(`${path}: function declaration`);
    if (ARROW_FUNCTION_EXPORT.test(text))
      violations.push(`${path}: exported arrow function`);
    if (MODULE_SCOPE_ARRAY_METHOD.test(text))
      violations.push(`${path}: module-scope .map/.filter/.reduce call`);
  }
  expect(violations).toEqual([]);
});

const ALLOWED_SUFFIXES = [
  ".typedefs.ts",
  ".constants.ts",
  ".service.ts",
  ".adapter.ts",
  ".command.ts",
  ".hook.ts",
  ".container.ts",
  ".parser.ts",
  ".serializer.ts",
  ".formatter.ts",
  ".builder.ts",
  ".ranker.ts",
  ".utils.ts",
];

/** Files that are entry points or barrels rather than one of the kinds above. */
const ALLOWED_EXACT_NAMES: ReadonlySet<string> = new Set([
  "index.ts",
  "main.ts",
  "version.ts",
]);

test("every production file carries a role suffix, so its name says what is inside", async () => {
  const files = await readProductionFiles(() => true);
  expect(files.size).toBeGreaterThan(100);

  const violations = [...files.keys()].filter((path) => {
    const basename = path.split("/").pop() ?? path;
    if (ALLOWED_EXACT_NAMES.has(basename)) return false;
    return !ALLOWED_SUFFIXES.some((suffix) => basename.endsWith(suffix));
  });

  expect(violations).toEqual([]);
});

test("every top-level module exposes an index.ts, and no directory below top level does", async () => {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)].filter(isProductionFile);

  const directories = new Set(
    paths.map((path) => path.split("/").slice(0, -1).join("/")).filter(Boolean),
  );
  const withIndex = new Set(
    paths
      .filter((path) => path.endsWith("/index.ts"))
      .map((path) => path.slice(0, -"/index.ts".length)),
  );

  const topLevelModules = new Set(
    [...directories].map((directory) => directory.split("/")[0] ?? directory),
  );
  expect(topLevelModules.size).toBeGreaterThan(0);

  const missingRootBarrel = [...topLevelModules]
    .filter((moduleName) => !withIndex.has(moduleName))
    .toSorted();
  expect(missingRootBarrel).toEqual([]);

  const nestedBarrels = [...directories]
    .filter((directory) => directory.includes("/"))
    .filter((directory) => withIndex.has(directory))
    .toSorted();
  expect(nestedBarrels).toEqual([]);
});
