import { describe, expect, test } from "bun:test";

import { LogLevel, parseConfig } from "../../../src/core/Config.ts";

describe("parseConfig defaults", () => {
  test("every default applies on an empty env", () => {
    const config = parseConfig({});
    expect(config.injectMinScore).toBe(0.2);
    expect(config.linkBoost).toBe(0.003);
    expect(config.injectLogEnabled).toBe(true);
    expect(config.blockAfter).toBe(2);
    expect(config.blockDrift).toBe(5);
    expect(config.gateDisabled).toBe(false);
    expect(config.consolidateCmd).toBe("claude --dangerously-skip-permissions");
    expect(config.logLevel).toBe(LogLevel.Warn);
  });
});

describe("parseConfig overrides", () => {
  test("CCMEM_INJECT_MIN_SCORE overrides the floor", () => {
    expect(parseConfig({ CCMEM_INJECT_MIN_SCORE: "0.5" }).injectMinScore).toBe(0.5);
  });

  test("CCMEM_LINK_BOOST overrides the RRF bonus", () => {
    expect(parseConfig({ CCMEM_LINK_BOOST: "0.01" }).linkBoost).toBe(0.01);
  });

  test("CCMEM_INJECT_LOG=0 disables logging, any other value leaves it enabled", () => {
    expect(parseConfig({ CCMEM_INJECT_LOG: "0" }).injectLogEnabled).toBe(false);
    expect(parseConfig({ CCMEM_INJECT_LOG: "false" }).injectLogEnabled).toBe(true);
  });

  test("CCMEM_BLOCK_AFTER / CCMEM_BLOCK_DRIFT override their thresholds", () => {
    const config = parseConfig({ CCMEM_BLOCK_AFTER: "3", CCMEM_BLOCK_DRIFT: "10" });
    expect(config.blockAfter).toBe(3);
    expect(config.blockDrift).toBe(10);
  });

  test("CCMEM_GATE_DISABLE=1 disables the gate, any other value leaves it enabled", () => {
    expect(parseConfig({ CCMEM_GATE_DISABLE: "1" }).gateDisabled).toBe(true);
    expect(parseConfig({ CCMEM_GATE_DISABLE: "yes" }).gateDisabled).toBe(false);
  });

  test("CCMEM_CONSOLIDATE_CMD overrides the reflector's spawn command", () => {
    expect(parseConfig({ CCMEM_CONSOLIDATE_CMD: "claude" }).consolidateCmd).toBe(
      "claude",
    );
  });

  test("CCMEM_LOG_LEVEL accepts every known level", () => {
    expect(parseConfig({ CCMEM_LOG_LEVEL: "debug" }).logLevel).toBe(LogLevel.Debug);
    expect(parseConfig({ CCMEM_LOG_LEVEL: "info" }).logLevel).toBe(LogLevel.Info);
    expect(parseConfig({ CCMEM_LOG_LEVEL: "error" }).logLevel).toBe(LogLevel.Error);
  });

  test("an unrecognized CCMEM_LOG_LEVEL falls back to warn", () => {
    expect(parseConfig({ CCMEM_LOG_LEVEL: "verbose" }).logLevel).toBe(LogLevel.Warn);
  });

  test("a malformed numeric env var falls back to its default rather than crashing", () => {
    const config = parseConfig({ CCMEM_BLOCK_AFTER: "not-a-number" });
    expect(config.blockAfter).toBe(2);
  });
});
