import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";

import type { AbsPath } from "../domain/AbsPath.ts";
import { LogLevel } from "../domain/Config.ts";
import type { Logger } from "../ports/logger.port.ts";

// New, additive behavior — there is no Python constant to port ([[bugfixes]] #2,
// #9 both introduce rotation where none existed). 1 MiB, 2 kept generations:
// <path> is the live file; a write that would push it over the cap rotates
// <path>.1 -> <path>.2 (dropping any existing <path>.2) and <path> -> <path>.1
// first, matching classic logrotate numbering (lower number = more recent).
const MAX_LOG_BYTES = 1_048_576;
const KEPT_GENERATIONS = 2;

const LEVEL_ORDER = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
} satisfies Readonly<Record<LogLevel, number>>;

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
 * because the same primitive backs `inject.jsonl` rotation ([[bugfixes]] #2),
 * which isn't a leveled log message and doesn't go through `Logger` at all.
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
 * fail-open diagnostics and the CLI's error path ([[bugfixes]] #9 — today's 15
 * silent `except: pass` blocks leave a broken memory system indistinguishable
 * from a quiet one). `minLevel` is `Config.logLevel` (`CCMEM_LOG_LEVEL`,
 * default `warn`), applied here rather than at every call site.
 */
export function makeLoggerFileAdapter(path: AbsPath, minLevel: LogLevel): Logger {
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
