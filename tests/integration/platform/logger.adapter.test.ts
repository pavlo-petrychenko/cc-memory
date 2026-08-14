import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { LogLevel } from "../../../src/core/Config.ts";
import {
  appendWithRotation,
  makeLoggerAdapter,
} from "../../../src/platform/logger.adapter.ts";
import { createTempDir, type TempDir } from "../../helpers/tempdir.ts";

const MAX_LOG_BYTES = 1_048_576; // must match the adapter's private constant

let tempDir: TempDir | null = null;

afterEach(() => {
  tempDir?.remove();
  tempDir = null;
});

function tempLogPath(): AbsPath {
  tempDir = createTempDir("ccmem-logger");
  // SAFETY: `createTempDir` always returns an absolute, resolved path, and
  // joining a literal filename onto it stays absolute.
  return join(tempDir.path, "ccmem.log") as AbsPath;
}

describe("logger adapter — level filtering", () => {
  test("a message below minLevel is not written at all", () => {
    const path = tempLogPath();
    const logger = makeLoggerAdapter(path, LogLevel.Warn);

    logger.debug("should not appear");
    logger.info("should not appear either");

    expect(existsSync(path)).toBe(false);
  });

  test("a message at or above minLevel is written", () => {
    const path = tempLogPath();
    const logger = makeLoggerAdapter(path, LogLevel.Warn);

    logger.warn("a warning");
    logger.error("an error");

    const contents = readFileSync(path, "utf-8");
    expect(contents).toContain("[warn] a warning");
    expect(contents).toContain("[error] an error");
  });
});

describe("logger adapter — size-capped rotation", () => {
  test("appending under the cap never rotates", () => {
    const path = tempLogPath();
    appendWithRotation(path, "short line");

    expect(existsSync(`${path}.1`)).toBe(false);
    expect(existsSync(`${path}.2`)).toBe(false);
  });

  test("a write that would cross the cap rotates the live file to .1 first", () => {
    const path = tempLogPath();
    // Fill the file to just under the cap with one write, then push it over.
    const filler = "x".repeat(MAX_LOG_BYTES - 10);
    appendWithRotation(path, filler);
    expect(existsSync(`${path}.1`)).toBe(false);

    appendWithRotation(path, "y".repeat(100));

    expect(existsSync(`${path}.1`)).toBe(true);
    expect(readFileSync(`${path}.1`, "utf-8")).toContain(filler);
    // The new live file holds only the line that triggered rotation.
    expect(readFileSync(path, "utf-8").trim()).toBe("y".repeat(100));
  });

  test("a second rotation pushes .1 to .2 and drops anything older than .2", () => {
    const path = tempLogPath();
    appendWithRotation(path, "x".repeat(MAX_LOG_BYTES - 10));
    appendWithRotation(path, "generation-1".repeat(100)); // rotates once -> .1 = filler

    appendWithRotation(path, "x".repeat(MAX_LOG_BYTES - 10));
    appendWithRotation(path, "generation-2".repeat(100)); // rotates again -> .2 = old .1, .1 = new filler

    expect(existsSync(`${path}.2`)).toBe(true);
    expect(readFileSync(`${path}.2`, "utf-8")).toContain("generation-1");
    expect(readFileSync(path, "utf-8").trim()).toBe("generation-2".repeat(100));
  });

  test("rotation creates the log directory if it doesn't exist yet", () => {
    tempDir = createTempDir("ccmem-logger-nested");
    // SAFETY: joining literal path segments onto an absolute temp dir.
    const nested = join(tempDir.path, "a", "b", "ccmem.log") as AbsPath;

    appendWithRotation(nested, "hello");

    expect(existsSync(nested)).toBe(true);
  });

  test("the live file never exceeds the cap by more than one write", () => {
    const path = tempLogPath();
    appendWithRotation(path, "x".repeat(MAX_LOG_BYTES - 10));
    appendWithRotation(path, "y".repeat(50));

    expect(statSync(path).size).toBeLessThan(MAX_LOG_BYTES);
  });
});
