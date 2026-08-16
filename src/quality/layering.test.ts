import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Layer direction beyond purity: the data layer (repository/projection/query)
 * and the application layer (use cases) never reach upward into application or
 * entry files. Service purity — that `.service.ts`/parsers/formatters never
 * touch a gateway — is enforced separately by `purity.test.ts`.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

const DATA_SUFFIXES = [".repository.ts", ".projection.ts", ".query.ts"];
const APP_SUFFIXES = [".useCase.ts"];
const ENTRY_SUFFIXES = [".command.ts", ".hook.ts", ".runner.ts"];

const IMPORT_SPECIFIER = /from\s+"@\/([^"]+)"/g;

function endsWithAny(specifier: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => specifier.endsWith(suffix));
}

async function collectImports(
  predicate: (path: string) => boolean,
): Promise<readonly { readonly importer: string; readonly specifier: string }[]> {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)]
    .filter(predicate)
    .toSorted();
  const perFile = await Promise.all(
    paths.map(async (path) => {
      const text = await Bun.file(SOURCE_ROOT + path).text();
      return [...text.matchAll(IMPORT_SPECIFIER)]
        .map((match) => match[1])
        .filter((specifier): specifier is string => specifier !== undefined)
        .map((specifier) => ({ importer: path, specifier }));
    }),
  );
  return perFile.flat();
}

test("the data layer never imports an application or entry file", async () => {
  const imports = await collectImports((path) => endsWithAny(path, DATA_SUFFIXES));
  expect(imports.length).toBeGreaterThan(0);

  const violations = imports
    .filter(
      ({ specifier }) =>
        endsWithAny(specifier, APP_SUFFIXES) || endsWithAny(specifier, ENTRY_SUFFIXES),
    )
    .map(({ importer, specifier }) => `${importer} -> @/${specifier}`)
    .toSorted();
  expect(violations).toEqual([]);
});

test("a use case never imports an entry file", async () => {
  const imports = await collectImports((path) => endsWithAny(path, APP_SUFFIXES));
  expect(imports.length).toBeGreaterThan(0);

  const violations = imports
    .filter(({ specifier }) => endsWithAny(specifier, ENTRY_SUFFIXES))
    .map(({ importer, specifier }) => `${importer} -> @/${specifier}`)
    .toSorted();
  expect(violations).toEqual([]);
});
