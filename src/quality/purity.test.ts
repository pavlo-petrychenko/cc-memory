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

/**
 * Modules are the unit of separation, so a cycle between two of them means they are
 * really one module wearing two names. `core/` is the shared kernel every module may
 * depend on, and `cli/` is the composition shell that may depend on all of them —
 * neither participates in a cycle by design.
 */
test("no import cycles between top-level modules", async () => {
  const sourceRoot = new URL("../", import.meta.url).pathname;
  const modulePaths = [...new Glob("**/*.ts").scanSync(sourceRoot)].filter(
    isProductionFile,
  );

  const edges = new Map<string, Set<string>>();
  await Promise.all(
    modulePaths.map(async (modulePath) => {
      const owner = modulePath.includes("/") ? (modulePath.split("/")[0] ?? null) : null;
      if (owner === null || owner === "core") return;
      const text = await Bun.file(sourceRoot + modulePath).text();
      for (const match of text.matchAll(/from\s+["']\.\.\/([a-zA-Z]+)\//g)) {
        const target = match[1];
        if (target === undefined || target === owner || target === "core") continue;
        const existing = edges.get(owner) ?? new Set<string>();
        existing.add(target);
        edges.set(owner, existing);
      }
    }),
  );

  const cycles: string[] = [];
  for (const [owner, targets] of edges) {
    for (const target of targets) {
      if (owner === "cli" || target === "cli") continue;
      if (edges.get(target)?.has(owner) === true && owner < target) {
        cycles.push(`${owner} <-> ${target}`);
      }
    }
  }

  expect(cycles).toEqual([]);
});
