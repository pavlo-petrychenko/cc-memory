/**
 * A read-only snapshot of the process environment, as an adapter would hand it
 * to `parseConfig`. Domain code never reads `process.env`/`Bun.env` itself — dates,
 * times, paths and env vars all arrive as parameters (CLAUDE.md's layering rule).
 */
export type EnvSnapshot = Readonly<Record<string, string | undefined>>;

/**
 * Log verbosity for the rotating `ccmem.log` ([[bugfixes]] #9 — new, additive:
 * today's 15 silent `except: pass` leave a broken memory system indistinguishable
 * from a quiet one). Not present in the Python; the set of levels is the
 * conventional one for this kind of file logger.
 */
export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

/**
 * Every `CCMEM_*` tunable (C5), parsed once per entrypoint instead of read as
 * import-time module constants scattered across `index.py`, `memory-inject.py`,
 * `wrap-gate.py` and `reflector.py` — the PoC's constants could not be tested
 * without reloading modules.
 */
export type Config = {
  /** `CCMEM_INJECT_MIN_SCORE` — BM25-strength floor for auto-injected hits (`memory-inject.py:24`). */
  readonly injectMinScore: number;
  /** `CCMEM_LINK_BOOST` — RRF bonus per corroborating in-link (`index.py:243`). */
  readonly linkBoost: number;
  /** `CCMEM_INJECT_LOG` — false only when set to exactly `"0"` (`memory-inject.py:34`). */
  readonly injectLogEnabled: boolean;
  /** `CCMEM_BLOCK_AFTER` — nudges required before the wrap-gate may block (`wrap-gate.py:23`). */
  readonly blockAfter: number;
  /** `CCMEM_BLOCK_DRIFT` — dirty-file count required before the wrap-gate may block (`wrap-gate.py:24`). */
  readonly blockDrift: number;
  /** `CCMEM_GATE_DISABLE` — true only when set to exactly `"1"` (`wrap-gate.py:25`). */
  readonly gateDisabled: boolean;
  /** `CCMEM_CONSOLIDATE_CMD` — the `claude` invocation the reflector spawns in tmux (`reflector.py:237`). */
  readonly consolidateCmd: string;
  /** `CCMEM_LOG_LEVEL` — new, additive ([[bugfixes]] #9). */
  readonly logLevel: LogLevel;
};

const INJECT_MIN_SCORE_DEFAULT = 0.2;
const LINK_BOOST_DEFAULT = 0.003;
const BLOCK_AFTER_DEFAULT = 2;
const BLOCK_DRIFT_DEFAULT = 5;
const CONSOLIDATE_CMD_DEFAULT = "claude --dangerously-skip-permissions";

/**
 * A malformed numeric env var falls back to its default rather than propagating
 * a parse failure: the Python reads these as import-time module constants with a
 * bare `int(...)`/`float(...)` call, so a bad value there crashes the hook script
 * before its own `try/except` in `main()` can catch it — a latent violation of the
 * "hooks fail open" invariant, not a behavior worth reproducing. Errors are
 * returned/defaulted here, never thrown across a module boundary (CLAUDE.md).
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

/** Build a `Config` from an env snapshot, applying every C5 default. */
export function parseConfig(env: EnvSnapshot): Config {
  return {
    injectMinScore: parseNumber(env["CCMEM_INJECT_MIN_SCORE"], INJECT_MIN_SCORE_DEFAULT),
    linkBoost: parseNumber(env["CCMEM_LINK_BOOST"], LINK_BOOST_DEFAULT),
    injectLogEnabled: env["CCMEM_INJECT_LOG"] !== "0",
    blockAfter: parseNumber(env["CCMEM_BLOCK_AFTER"], BLOCK_AFTER_DEFAULT),
    blockDrift: parseNumber(env["CCMEM_BLOCK_DRIFT"], BLOCK_DRIFT_DEFAULT),
    gateDisabled: env["CCMEM_GATE_DISABLE"] === "1",
    consolidateCmd: env["CCMEM_CONSOLIDATE_CMD"] ?? CONSOLIDATE_CMD_DEFAULT,
    logLevel: parseLogLevel(env["CCMEM_LOG_LEVEL"]),
  };
}
