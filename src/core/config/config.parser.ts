import {
  BLOCK_AFTER_DEFAULT,
  BLOCK_DRIFT_DEFAULT,
  ENV_BLOCK_AFTER,
  ENV_BLOCK_DRIFT,
  ENV_GATE_DISABLE,
  ENV_INJECT_LOG,
  ENV_INJECT_MIN_SCORE,
  ENV_LINK_BOOST,
  ENV_LOG_LEVEL,
  GATE_DISABLED_VALUE,
  INJECT_LOG_DISABLED_VALUE,
  INJECT_MIN_SCORE_DEFAULT,
  LINK_BOOST_DEFAULT,
} from "@/core/config/config.constants.ts";
import {
  type Config,
  type EnvSnapshot,
  LogLevel,
} from "@/core/config/config.typedefs.ts";

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
    injectMinScore: parseNumber(env[ENV_INJECT_MIN_SCORE], INJECT_MIN_SCORE_DEFAULT),
    linkBoost: parseNumber(env[ENV_LINK_BOOST], LINK_BOOST_DEFAULT),
    injectLogEnabled: env[ENV_INJECT_LOG] !== INJECT_LOG_DISABLED_VALUE,
    blockAfter: parseNumber(env[ENV_BLOCK_AFTER], BLOCK_AFTER_DEFAULT),
    blockDrift: parseNumber(env[ENV_BLOCK_DRIFT], BLOCK_DRIFT_DEFAULT),
    gateDisabled: env[ENV_GATE_DISABLE] === GATE_DISABLED_VALUE,
    logLevel: parseLogLevel(env[ENV_LOG_LEVEL]),
  };
}
