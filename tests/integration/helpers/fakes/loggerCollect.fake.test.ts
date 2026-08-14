import { describe, expect, test } from "bun:test";

import { LogLevel } from "../../../../src/domain/Config.ts";
import { makeLoggerFake } from "../../../helpers/fakes/loggerCollect.fake.ts";

describe("loggerFake", () => {
  test("collects every level's calls in order", () => {
    const logger = makeLoggerFake();

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(logger.entries).toEqual([
      { level: LogLevel.Debug, message: "d" },
      { level: LogLevel.Info, message: "i" },
      { level: LogLevel.Warn, message: "w" },
      { level: LogLevel.Error, message: "e" },
    ]);
  });

  test("starts empty", () => {
    const logger = makeLoggerFake();

    expect(logger.entries).toEqual([]);
  });
});
