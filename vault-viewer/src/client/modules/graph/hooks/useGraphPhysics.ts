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

function loadConfig(): GraphConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphConfig>;
      return { ...GRAPH_DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // ignore
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
