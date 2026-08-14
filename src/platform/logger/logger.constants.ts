import { LogLevel } from "@/core/index.ts";

// 1 MiB, 2 kept generations: <path> is the live file; a write that would push
// it over the cap rotates <path>.1 -> <path>.2 (dropping any existing
// <path>.2) and <path> -> <path>.1 first, matching classic logrotate
// numbering (lower number = more recent).
export const MAX_LOG_BYTES = 1_048_576;
export const KEPT_GENERATIONS = 2;

export const LEVEL_ORDER = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
} satisfies Readonly<Record<LogLevel, number>>;
