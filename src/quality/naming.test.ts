import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * A basename prefix belongs to exactly one module: the same prefix appearing in
 * two modules (`worklogFloor` once lived in both `worklog` and `session`) means
 * one concept is wearing two names, which is how a rename on one side silently
 * breaks the other.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

const ROLE_SUFFIXES = [
  ".entity.ts",
  ".service.ts",
  ".command.ts",
  ".hook.ts",
  ".parser.ts",
  ".serializer.ts",
  ".formatter.ts",
  ".builder.ts",
  ".ranker.ts",
  ".runner.ts",
  ".useCase.ts",
  ".repository.ts",
  ".projection.ts",
  ".query.ts",
];

function moduleNameOf(path: string): string {
  const segments = path.split("/");
  if (segments[0] === "modules" && segments[1] !== undefined) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] ?? path;
}

function basenamePrefix(path: string): string | null {
  const basename = path.split("/").pop() ?? "";
  for (const suffix of ROLE_SUFFIXES) {
    if (basename.endsWith(suffix)) {
      return basename.slice(0, -suffix.length);
    }
  }
  return null;
}

test("a basename prefix belongs to exactly one module", () => {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)].filter(
    (path) =>
      !path.endsWith(".test.ts") &&
      !path.startsWith("testing/") &&
      !path.startsWith("quality/") &&
      !path.startsWith("skills/") &&
      path !== "version.ts",
  );

  const prefixToModules = new Map<string, Set<string>>();
  for (const path of paths) {
    const prefix = basenamePrefix(path);
    if (prefix === null) continue;
    const modules = prefixToModules.get(prefix) ?? new Set<string>();
    modules.add(moduleNameOf(path));
    prefixToModules.set(prefix, modules);
  }

  // Guard against the rule silently covering nothing. The threshold tracks the
  // number of unique basename prefixes, which shrinks as use cases fold into
  // services (a smoke test, not a precise inventory).
  expect(prefixToModules.size).toBeGreaterThan(40);

  const collisions = [...prefixToModules.entries()]
    .filter(([, modules]) => modules.size > 1)
    .map(([prefix, modules]) => `${prefix} -> ${[...modules].toSorted().join(", ")}`)
    .toSorted();
  expect(collisions).toEqual([]);
});
