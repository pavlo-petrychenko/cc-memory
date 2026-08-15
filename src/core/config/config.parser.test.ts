import { describe, expect, test } from "bun:test";

import { ConfigParser } from "@/core/config/config.parser.ts";
import { LogLevel } from "@/core/config/config.typedefs.ts";

describe("ConfigParser.parse defaults", () => {
  test("every default applies on an empty env", () => {
    const config = new ConfigParser().parse({});
    expect(config.injectMinScore).toBe(0.2);
    expect(config.linkBoost).toBe(0.003);
    expect(config.injectLogEnabled).toBe(true);
    expect(config.blockAfter).toBe(2);
    expect(config.blockDrift).toBe(5);
    expect(config.gateDisabled).toBe(false);
    expect(config.logLevel).toBe(LogLevel.Warn);
  });
});

describe("ConfigParser.parse overrides", () => {
  test("CCMEM_INJECT_MIN_SCORE overrides the floor", () => {
    expect(
      new ConfigParser().parse({ CCMEM_INJECT_MIN_SCORE: "0.5" }).injectMinScore,
    ).toBe(0.5);
  });

  test("CCMEM_LINK_BOOST overrides the RRF bonus", () => {
    expect(new ConfigParser().parse({ CCMEM_LINK_BOOST: "0.01" }).linkBoost).toBe(0.01);
  });

  test("CCMEM_INJECT_LOG=0 disables logging, any other value leaves it enabled", () => {
    expect(new ConfigParser().parse({ CCMEM_INJECT_LOG: "0" }).injectLogEnabled).toBe(
      false,
    );
    expect(new ConfigParser().parse({ CCMEM_INJECT_LOG: "false" }).injectLogEnabled).toBe(
      true,
    );
  });

  test("CCMEM_BLOCK_AFTER / CCMEM_BLOCK_DRIFT override their thresholds", () => {
    const config = new ConfigParser().parse({
      CCMEM_BLOCK_AFTER: "3",
      CCMEM_BLOCK_DRIFT: "10",
    });
    expect(config.blockAfter).toBe(3);
    expect(config.blockDrift).toBe(10);
  });

  test("CCMEM_GATE_DISABLE=1 disables the gate, any other value leaves it enabled", () => {
    expect(new ConfigParser().parse({ CCMEM_GATE_DISABLE: "1" }).gateDisabled).toBe(true);
    expect(new ConfigParser().parse({ CCMEM_GATE_DISABLE: "yes" }).gateDisabled).toBe(
      false,
    );
  });

  test("CCMEM_LOG_LEVEL accepts every known level", () => {
    expect(new ConfigParser().parse({ CCMEM_LOG_LEVEL: "debug" }).logLevel).toBe(
      LogLevel.Debug,
    );
    expect(new ConfigParser().parse({ CCMEM_LOG_LEVEL: "info" }).logLevel).toBe(
      LogLevel.Info,
    );
    expect(new ConfigParser().parse({ CCMEM_LOG_LEVEL: "error" }).logLevel).toBe(
      LogLevel.Error,
    );
  });

  test("an unrecognized CCMEM_LOG_LEVEL falls back to warn", () => {
    expect(new ConfigParser().parse({ CCMEM_LOG_LEVEL: "verbose" }).logLevel).toBe(
      LogLevel.Warn,
    );
  });

  test("a malformed numeric env var falls back to its default rather than crashing", () => {
    const config = new ConfigParser().parse({ CCMEM_BLOCK_AFTER: "not-a-number" });
    expect(config.blockAfter).toBe(2);
  });
});
