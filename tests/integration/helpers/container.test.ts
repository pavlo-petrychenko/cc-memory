import { describe, expect, test } from "bun:test";

import { LogLevel } from "../../../src/domain/Config.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeLoggerFake } from "../../helpers/fakes/loggerCollect.fake.ts";

describe("makeTestContainer", () => {
  test("bundles a working fake for every port", () => {
    const container = makeTestContainer();

    expect(container.fs).toBeDefined();
    expect(container.git).toBeDefined();
    expect(container.proc).toBeDefined();
    expect(container.clock).toBeDefined();
    expect(container.env).toBeDefined();
    expect(container.logger).toBeDefined();
    expect(container.openDb).toBeDefined();
    expect(container.stdio).toBeDefined();
  });

  test("openDb opens a real bun:sqlite handle, memoized by path", () => {
    const container = makeTestContainer();

    const first = container.openDb(":memory:");
    const second = container.openDb(":memory:");

    first.exec("CREATE TABLE probe(x INTEGER)");
    first.run("INSERT INTO probe (x) VALUES (?)", [1]);

    expect(second.query<{ readonly x: number }>("SELECT x FROM probe", [])).toEqual([
      { x: 1 },
    ]);
    first.close();
  });

  test("overrides replace only the ports a test names, leaving the rest default", () => {
    const customLogger = makeLoggerFake();

    const container = makeTestContainer({ logger: customLogger });
    container.logger.warn("hello");

    expect(customLogger.entries).toEqual([{ level: LogLevel.Warn, message: "hello" }]);
    expect(container.fs).toBeDefined(); // untouched default still present
  });
});
