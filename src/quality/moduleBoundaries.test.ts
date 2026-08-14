import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * A module is only swappable if nothing depends on its insides. These two tests are what
 * make that true rather than aspirational: one keeps every cross-module import pointed at
 * a declared API, the other keeps the dependency graph acyclic.
 *
 * The cycle check lived in `purity.test.ts` and matched `from "../<module>/"`. The move to
 * absolute imports silently emptied it — every specifier became `@/<module>/…`, the regex
 * stopped matching, and a passing test was checking nothing at all. Both tests below
 * therefore assert their own input is non-empty before asserting on it.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

const IMPORT_SPECIFIER = /from\s+"@\/([^"]+)"/g;

/** Not production modules: tests, and the fakes and fixtures that exist to serve them. */
function isProductionFile(modulePath: string): boolean {
  if (modulePath.endsWith(".test.ts")) return false;
  return !modulePath.startsWith("testing/") && !modulePath.startsWith("quality/");
}

type CrossModuleImport = {
  readonly importer: string;
  readonly specifier: string;
  readonly targetModule: string;
};

async function collectCrossModuleImports(): Promise<readonly CrossModuleImport[]> {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)].toSorted();

  const perFile = await Promise.all(
    paths.map(async (importer) => {
      const owner = importer.split("/")[0] ?? importer;
      const text = await Bun.file(SOURCE_ROOT + importer).text();
      return [...text.matchAll(IMPORT_SPECIFIER)]
        .map((match) => match[1] ?? "")
        .filter((specifier) => (specifier.split("/")[0] ?? "") !== owner)
        .map((specifier) => ({
          importer,
          specifier,
          targetModule: specifier.split("/")[0] ?? specifier,
        }));
    }),
  );

  return perFile.flat();
}

/**
 * Declarations are reachable directly across modules: a type or a frozen value has no
 * behavior to swap and cannot participate in a runtime cycle. Only implementation has to
 * come through the barrel.
 */
const DECLARATION_SUFFIXES = [".typedefs.ts", ".constants.ts"];

/**
 * `testing/` deliberately has no barrel. A test names the one fake or fixture it needs,
 * which reads better than a barrel that would pull every fake — and every port adapter
 * behind them — into any file touching one.
 *
 * `version.ts` is a single top-level constant rather than a module, so it has no index to
 * import through.
 */
const BARREL_EXEMPT_PREFIXES = ["testing/"];
const BARREL_EXEMPT_SPECIFIERS: ReadonlySet<string> = new Set(["version.ts"]);

test("a cross-module import names the module's index.ts, never a file inside it", async () => {
  const crossModuleImports = await collectCrossModuleImports();
  expect(crossModuleImports.length).toBeGreaterThan(100);

  const violations = crossModuleImports
    .filter(({ specifier }) => {
      if (BARREL_EXEMPT_SPECIFIERS.has(specifier)) return false;
      if (BARREL_EXEMPT_PREFIXES.some((prefix) => specifier.startsWith(prefix)))
        return false;
      if (specifier.endsWith("/index.ts")) return false;
      return !DECLARATION_SUFFIXES.some((suffix) => specifier.endsWith(suffix));
    })
    .map(({ importer, specifier }) => `${importer} -> @/${specifier}`);

  expect(violations).toEqual([]);
});

test("only tests reach into testing/", async () => {
  const crossModuleImports = await collectCrossModuleImports();

  const violations = crossModuleImports
    .filter(({ importer, specifier }) => {
      if (!specifier.startsWith("testing/")) return false;
      return isProductionFile(importer);
    })
    .map(({ importer, specifier }) => `${importer} -> @/${specifier}`);

  expect(violations).toEqual([]);
});

/**
 * A cycle between two modules means they are really one module wearing two names.
 *
 * `core/` is the shared kernel every module may depend on and `cli/` is the composition
 * shell that may depend on all of them, so neither can be half of a cycle by design.
 */
const CYCLE_EXEMPT_MODULES: ReadonlySet<string> = new Set(["core", "cli", "testing"]);

test("no import cycles between top-level modules", async () => {
  const crossModuleImports = (await collectCrossModuleImports()).filter(({ importer }) =>
    isProductionFile(importer),
  );

  const dependencies = new Map<string, Set<string>>();
  for (const { importer, targetModule } of crossModuleImports) {
    const owner = importer.split("/")[0] ?? importer;
    if (CYCLE_EXEMPT_MODULES.has(owner) || CYCLE_EXEMPT_MODULES.has(targetModule))
      continue;
    const existing = dependencies.get(owner) ?? new Set<string>();
    existing.add(targetModule);
    dependencies.set(owner, existing);
  }

  // The graph must actually have edges, or "no cycles" is trivially true.
  expect(dependencies.size).toBeGreaterThan(2);

  const cycles: string[] = [];
  for (const [owner, targets] of dependencies) {
    for (const target of targets) {
      if (owner < target && dependencies.get(target)?.has(owner) === true) {
        cycles.push(`${owner} <-> ${target}`);
      }
    }
  }

  expect(cycles).toEqual([]);
});
