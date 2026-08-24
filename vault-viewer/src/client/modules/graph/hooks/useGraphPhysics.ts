import { GRAPH_DEFAULT_CONFIG } from "@shared/contracts/constants.js";
import { useCallback, useEffect, useState } from "react";

export type GraphConfig = {
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  collideRadius: number;
  clusterStrength: number;
  centerStrength: number;
};

const STORAGE_KEY = "consoleGraphConfig";

// JSON decoding helpers: `Object.prototype.toString` tags instead of `typeof`,
// matching the boundary-parser style used across this repo.
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

function isJsonNumber(value: JsonValue | undefined): value is number {
  return Object.prototype.toString.call(value) === "[object Number]";
}

const CONFIG_KEYS: ReadonlyArray<keyof GraphConfig> = [
  "linkDistance",
  "linkStrength",
  "chargeStrength",
  "collideRadius",
  "clusterStrength",
  "centerStrength",
];

// localStorage content is untrusted: keep only finite numbers under known
// config keys and let the caller merge them over the defaults.
function sanitizeConfig(parsed: JsonValue): Partial<GraphConfig> {
  if (!isJsonRecord(parsed)) return {};
  const partial: Partial<GraphConfig> = {};
  for (const key of CONFIG_KEYS) {
    const value = parsed[key];
    if (isJsonNumber(value) && Number.isFinite(value)) {
      partial[key] = value;
    }
  }
  return partial;
}

function loadConfig(): GraphConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...GRAPH_DEFAULT_CONFIG, ...sanitizeConfig(JSON.parse(raw)) };
    }
  } catch {
    // malformed stored config: fall through to defaults
  }
  return { ...GRAPH_DEFAULT_CONFIG };
}

export function useGraphPhysics() {
  const [config, setConfig] = useState<GraphConfig>(() => loadConfig());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore quota
    }
  }, [config]);

  const reset = useCallback(() => {
    setConfig({ ...GRAPH_DEFAULT_CONFIG });
  }, []);

  return { config, setConfig, reset };
}
