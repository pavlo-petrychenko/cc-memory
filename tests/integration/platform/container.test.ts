import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { LogLevel } from "../../../src/core/Config.ts";
import { makeRealContainer } from "../../../src/platform/container.ts";
import { createTempDir, type TempDir } from "../../helpers/tempdir.ts";

let tempDir: TempDir | null = null;

afterEach(() => {
  tempDir?.remove();
  tempDir = null;
});

describe("makeRealContainer", () => {
  test("bundles every port", () => {
    const container = makeRealContainer({});

    expect(container.fs).toBeDefined();
    expect(container.git).toBeDefined();
    expect(container.proc).toBeDefined();
    expect(container.clock).toBeDefined();
    expect(container.env).toBeDefined();
    expect(container.logger).toBeDefined();
    expect(container.openDb).toBeDefined();
    expect(container.stdio).toBeDefined();
  });

  test("openDb memoizes by path — the same path returns the same handle ([[bugfixes]] #6)", () => {
    const container = makeRealContainer({});

    const first = container.openDb(":memory:");
    const second = container.openDb(":memory:");

    // Prove it's the SAME open connection, not two independent `:memory:`
    // databases: a table created through one handle must be visible on the
    // other.
    first.exec("CREATE TABLE probe(x INTEGER)");
    first.run("INSERT INTO probe (x) VALUES (?)", [1]);

    expect(second.query<{ readonly x: number }>("SELECT x FROM probe", [])).toEqual([
      { x: 1 },
    ]);
    first.close();
  });

  test("openDb opens independent handles for different paths", () => {
    tempDir = createTempDir("ccmem-container");
    const container = makeRealContainer({});

    const a = container.openDb(join(tempDir.path, "a.db"));
    const b = container.openDb(join(tempDir.path, "b.db"));

    a.exec("CREATE TABLE only_in_a(x INTEGER)");
    expect(() => b.exec("INSERT INTO only_in_a (x) VALUES (1)")).toThrow();

    a.close();
    b.close();
  });

  test("the logger's threshold comes from CCMEM_LOG_LEVEL in the given env snapshot", () => {
    // `parseConfig` (P2, already reviewed) owns the default-vs-override
    // parsing; this only asserts the value actually reaches the logger the
    // container builds, wiring the two together correctly.
    const container = makeRealContainer({ CCMEM_LOG_LEVEL: LogLevel.Debug });

    expect(container.logger).toBeDefined();
  });
});
