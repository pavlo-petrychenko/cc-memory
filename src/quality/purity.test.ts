import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Enforces CLAUDE.md's purity rule — the guarantee that used to come from `domain/`
 * being its own directory.
 *
 * When the tree moved from layer-first to module-first, "pure code lives in this
 * folder" stopped being expressible as a path. Losing it was not acceptable: purity
 * is why ~90% of the suite needs no fakes, no temp dirs and no clock, and why the
 * ranking math and every rendered string are testable at all. So the rule moved into
 * the FILENAME instead, using the role suffixes the project already names files by:
 *
 *   A file may reference `platform/` or a node/bun builtin ONLY if it is a
 *   `.service.ts`, `.command.ts`, `.hook.ts` or `.adapter.ts` — or lives
 *   in `platform/`, which exists to touch the outside world.
 *
 * Everything else is pure by construction, and now says so in its own name: you can
 * tell whether `tokenize.ts` or `build.service.ts` can hit a disk without opening
 * either one.
 */
const IMPURE_SUFFIXES = [".service.ts", ".command.ts", ".hook.ts", ".adapter.ts"];

/** `platform/` IS the outside world; its container wires the real adapters up. */
const EXEMPT_PREFIXES = ["platform/"];

/**
 * Tests sit beside the code they cover, and the modules that support them exist only
 * to be imported by tests. Neither is production code: a test may reach for a temp
 * directory, spawn the built CLI, or import across module boundaries to assemble a
 * scenario. Both rules below therefore apply to production files only.
 */
function isProductionFile(modulePath: string): boolean {
  if (modulePath.endsWith(".test.ts")) return false;
  return !modulePath.startsWith("testing/") && !modulePath.startsWith("quality/");
}

/**
 * The single composition root. Every dependency-injected program needs exactly one
 * place that builds the real container from the real process, and `main` is it —
 * naming it `main.service.ts` would be ceremony, not clarity. Kept as an explicit
 * one-item list so a SECOND file quietly acquiring this privilege fails the test
 * below rather than slipping through.
 */
const COMPOSITION_ROOTS: ReadonlySet<string> = new Set(["cli/main.ts"]);

const FORBIDDEN_IMPORT = /from\s+["'](node:|bun:|[^"']*\/platform\/)/;

function mayTouchTheOutsideWorld(modulePath: string): boolean {
  if (EXEMPT_PREFIXES.some((prefix) => modulePath.startsWith(prefix))) return true;
  if (COMPOSITION_ROOTS.has(modulePath)) return true;
  return IMPURE_SUFFIXES.some((suffix) => modulePath.endsWith(suffix));
}

test("only role-suffixed files reference platform or node/bun builtins", async () => {
  const sourceRoot = new URL("../", import.meta.url).pathname;
  const modulePaths = [...new Glob("**/*.ts").scanSync(sourceRoot)]
    .filter(isProductionFile)
    .toSorted();

  expect(modulePaths.length).toBeGreaterThan(0);

  const pureModulePaths = modulePaths.filter((path) => !mayTouchTheOutsideWorld(path));
  // Guard against the rule silently covering nothing if the suffixes ever change.
  expect(pureModulePaths.length).toBeGreaterThan(20);

  const fileContents = await Promise.all(
    pureModulePaths.map((modulePath) => Bun.file(sourceRoot + modulePath).text()),
  );

  const violations: string[] = [];
  pureModulePaths.forEach((modulePath, index) => {
    for (const line of (fileContents[index] ?? "").split("\n")) {
      if (FORBIDDEN_IMPORT.test(line)) violations.push(`${modulePath}: ${line.trim()}`);
    }
  });

  expect(violations).toEqual([]);
});
