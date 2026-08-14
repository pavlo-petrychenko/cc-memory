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

const INJECT_MIN_SCORE_DEFAULT = 0.2;
const LINK_BOOST_DEFAULT = 0.003;
const BLOCK_AFTER_DEFAULT = 2;
const BLOCK_DRIFT_DEFAULT = 5;

/**
 * A malformed numeric env var falls back to its default rather than propagating
 * a parse failure — a bad tunable must never crash a hook, since hooks must
 * always fail open.
 */
function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  switch (raw) {
    case LogLevel.Debug:
      return LogLevel.Debug;
    case LogLevel.Info:
      return LogLevel.Info;
    case LogLevel.Error:
      return LogLevel.Error;
    default:
      return LogLevel.Warn;
  }
}

/** Build a `Config` from an env snapshot, applying every default. */
export function parseConfig(env: EnvSnapshot): Config {
  return {
    injectMinScore: parseNumber(env["CCMEM_INJECT_MIN_SCORE"], INJECT_MIN_SCORE_DEFAULT),
    linkBoost: parseNumber(env["CCMEM_LINK_BOOST"], LINK_BOOST_DEFAULT),
    injectLogEnabled: env["CCMEM_INJECT_LOG"] !== "0",
    blockAfter: parseNumber(env["CCMEM_BLOCK_AFTER"], BLOCK_AFTER_DEFAULT),
    blockDrift: parseNumber(env["CCMEM_BLOCK_DRIFT"], BLOCK_DRIFT_DEFAULT),
    gateDisabled: env["CCMEM_GATE_DISABLE"] === "1",
    logLevel: parseLogLevel(env["CCMEM_LOG_LEVEL"]),
  };
}
