import { absPath, LogLevel } from "@/core/index.ts";
import type { RunContext } from "@/core/index.ts";

/** A fixed `RunContext` for command tests — a hand-written, already-absolute
 * home/cwd and the default config. */
export function makeRunContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    home: absPath("/home/test"),
    cwd: absPath("/home/test/project"),
    config: {
      injectMinScore: 0.2,
      linkBoost: 0.003,
      injectLogEnabled: true,
      blockAfter: 2,
      blockDrift: 5,
      gateDisabled: false,
      logLevel: LogLevel.Warn,
    },
    ...overrides,
  };
}
