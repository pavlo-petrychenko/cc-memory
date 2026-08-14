import { expect, test } from "bun:test";

import { Glob } from "bun";

/**
 * Enforces CLAUDE.md's layering rule: nothing under `src/domain/` may import
 * `node:*`, `bun:*`, `../ports` or `../adapters`. Domain code is pure — dates,
 * times, paths and file contents arrive as parameters — which is what makes
 * `rank.ts`'s fusion math and every `render/*` string testable without a
 * database, a process or a clock.
 */
test("no file under src/domain imports node/bun builtins, ports or adapters", async () => {
  const domainRoot = new URL("../../src/domain/", import.meta.url).pathname;
  const modulePaths = [...new Glob("**/*.ts").scanSync(domainRoot)].toSorted();

  expect(modulePaths.length).toBeGreaterThan(0);

  const forbiddenImport = /from\s+["'](node:|bun:|\.\.\/ports|\.\.\/adapters)/;
  const fileContents = await Promise.all(
    modulePaths.map((modulePath) => Bun.file(domainRoot + modulePath).text()),
  );

  const violations: string[] = [];
  modulePaths.forEach((modulePath, index) => {
    const text = fileContents[index] ?? "";
    for (const line of text.split("\n")) {
      if (forbiddenImport.test(line)) violations.push(`${modulePath}: ${line.trim()}`);
    }
  });

  expect(violations).toEqual([]);
});
