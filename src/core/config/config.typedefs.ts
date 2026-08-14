/**
 * A read-only snapshot of the process environment, as an adapter would hand it
 * to `parseConfig`. Domain code never reads `process.env`/`Bun.env` itself — dates,
 * times, paths and env vars all arrive as parameters.
 */
export type EnvSnapshot = Readonly<Record<string, string | undefined>>;

/** Log verbosity for the rotating `ccmem.log`. */
export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

/** Every `CCMEM_*` tunable, parsed once per entrypoint rather than read ad hoc. */
export type Config = {
  /** `CCMEM_INJECT_MIN_SCORE` — BM25-strength floor for auto-injected hits. */
  readonly injectMinScore: number;
  /** `CCMEM_LINK_BOOST` — RRF bonus per corroborating in-link. */
  readonly linkBoost: number;
  /** `CCMEM_INJECT_LOG` — false only when set to exactly `"0"`. */
  readonly injectLogEnabled: boolean;
  /** `CCMEM_BLOCK_AFTER` — nudges required before the wrap-gate may block. */
  readonly blockAfter: number;
  /** `CCMEM_BLOCK_DRIFT` — dirty-file count required before the wrap-gate may block. */
  readonly blockDrift: number;
  /** `CCMEM_GATE_DISABLE` — true only when set to exactly `"1"`. */
  readonly gateDisabled: boolean;
  /** `CCMEM_LOG_LEVEL` — controls the rotating log's verbosity. */
  readonly logLevel: LogLevel;
};
