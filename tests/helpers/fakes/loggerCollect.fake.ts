import { LogLevel } from "../../../src/domain/Config.ts";
import type { Logger } from "../../../src/ports/logger.port.ts";

export type CollectedLogEntry = {
  readonly level: LogLevel;
  readonly message: string;
};

export type LoggerFake = Logger & {
  readonly entries: readonly CollectedLogEntry[];
};

/** A `Logger` that collects every call in order instead of writing anywhere —
 * what a hook/CLI test asserts "the failure was logged" against. */
export function makeLoggerFake(): LoggerFake {
  const entries: CollectedLogEntry[] = [];
  const record = (level: LogLevel, message: string): void => {
    entries.push({ level, message });
  };
  return {
    entries,
    debug: (message: string) => record(LogLevel.Debug, message),
    info: (message: string) => record(LogLevel.Info, message),
    warn: (message: string) => record(LogLevel.Warn, message),
    error: (message: string) => record(LogLevel.Error, message),
  };
}
