import { LogLevel } from "@/core/index.ts";
import type { Logger } from "@/platform/index.ts";

export type CollectedLogEntry = {
  readonly level: LogLevel;
  readonly message: string;
};

export type LoggerFake = Logger & {
  readonly entries: readonly CollectedLogEntry[];
};

/** A `Logger` that collects every call in order instead of writing anywhere. */
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
