import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";

import type { AbsPath } from "@/core/index.ts";
import { LogLevel } from "@/core/index.ts";
import {
  KEPT_GENERATIONS,
  LEVEL_ORDER,
  MAX_LOG_BYTES,
} from "@/platform/logger/logger.constants.ts";
import type { Logger } from "@/platform/logger/logger.typedefs.ts";

function currentSize(path: AbsPath): number {
  try {
    return statSync(path).size;
  } catch {
    return 0; // file does not exist yet
  }
}

function rotate(path: AbsPath): void {
  for (let generation = KEPT_GENERATIONS; generation >= 1; generation -= 1) {
    const from = generation === 1 ? path : `${path}.${generation - 1}`;
    const to = `${path}.${generation}`;
    if (!existsSync(from)) continue;
    if (generation === KEPT_GENERATIONS) rmSync(to, { force: true });
    renameSync(from, to);
  }
}

/**
 * Append one line to `path`, rotating first if the write would push the file
 * past `MAX_LOG_BYTES`. Exported standalone (not only via the `Logger` port)
 * because the same primitive backs `inject.jsonl` rotation, which isn't a
 * leveled log message and doesn't go through `Logger` at all.
 */
export function appendWithRotation(path: AbsPath, line: string): void {
  const encoded = `${line}\n`;
  mkdirSync(dirname(path), { recursive: true });
  if (currentSize(path) + Buffer.byteLength(encoded, "utf-8") > MAX_LOG_BYTES) {
    rotate(path);
  }
  appendFileSync(path, encoded, "utf-8");
}

function formatLine(level: LogLevel, message: string): string {
  return `${new Date().toISOString()} [${level}] ${message}`;
}

/**
 * The real `Logger`: a size-capped rotating file backing both the hook
 * fail-open diagnostics and the CLI's error path. `minLevel` is
 * `Config.logLevel` (`CCMEM_LOG_LEVEL`, default `warn`), applied here rather
 * than at every call site.
 */
export function makeLoggerAdapter(path: AbsPath, minLevel: LogLevel): Logger {
  const write = (level: LogLevel, message: string): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    appendWithRotation(path, formatLine(level, message));
  };
  return {
    debug: (message) => write(LogLevel.Debug, message),
    info: (message) => write(LogLevel.Info, message),
    warn: (message) => write(LogLevel.Warn, message),
    error: (message) => write(LogLevel.Error, message),
  };
}
