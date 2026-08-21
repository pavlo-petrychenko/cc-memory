import type { JSX } from "react";
import type { GraphConfig } from "../hooks/useGraphPhysics.js";
import { GRAPH_DEFAULT_CONFIG } from "@shared/contracts/constants.js";

type Props = {
  config: GraphConfig;
  setConfig: React.Dispatch<React.SetStateAction<GraphConfig>>;
  onReset: () => void;
};

const SLIDERS: Array<{ key: keyof GraphConfig; label: string; min: number; max: number; step: number }> = [
  { key: "linkDistance", label: "Link distance", min: 24, max: 160, step: 2 },
  { key: "linkStrength", label: "Link strength", min: 0.05, max: 1, step: 0.05 },
  { key: "chargeStrength", label: "Repulsion", min: -420, max: -20, step: 10 },
  { key: "collideRadius", label: "Collision", min: 2, max: 22, step: 1 },
  { key: "clusterStrength", label: "Cluster (same feature)", min: 0, max: 0.5, step: 0.02 },
  { key: "centerStrength", label: "Center gravity", min: 0, max: 0.4, step: 0.02 },
];

export function GraphConfigPanel({ config, setConfig, onReset }: Props): JSX.Element {
  const handleReset = (): void => {
    onReset();
    // Ensure persisted value matches default immediately
    setConfig({ ...GRAPH_DEFAULT_CONFIG });
  };

  return (
    <div
      style={{
        background: "var(--panel2)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "10px 18px",
      }}
    >
      {SLIDERS.map((f) => (
        <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {f.label} <b style={{ color: "var(--text)", fontWeight: 500 }}>{config[f.key]}</b>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={config[f.key]}
            onChange={(e) => setConfig((c) => ({ ...c, [f.key]: Number(e.target.value) }))}
            style={{ accentColor: "var(--accent)", width: "100%" }}
          />
        </label>
      ))}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
        <span style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4 }}>
          Same-feature nodes & linked nodes attract stronger. Drag nodes to pin (double-click to unpin) • Scroll to zoom • Drag background to pan •
          Double-click background to reset zoom.
        </span>
        <button
          type="button"
          onClick={handleReset}
          style={{
            marginLeft: "auto",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            color: "var(--muted)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Reset defaults
        </button>
      </div>
    </div>
  );
}
