import type { JSX } from "react";

type Props = {
  featureList: string[];
  featureColor: Map<string, string>;
};

export function GraphLegend({ featureList, featureColor }: Props): JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "9px 11px",
        fontSize: 11,
        color: "var(--muted)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        maxWidth: 220,
        boxShadow: "0 4px 16px rgba(0,0,0,.25)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 10,
            height: 2,
            background: "var(--accent)",
            display: "inline-block",
            borderRadius: 2,
          }}
        />
        Feature colors
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
        {featureList.slice(0, 10).map((f) => (
          <span
            key={f}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: featureColor.get(f) ?? "#7A7A85",
                display: "inline-block",
                border: "1px solid rgba(0,0,0,.15)",
              }}
            />
            {f}
          </span>
        ))}
        {featureList.length === 0 ? (
          <span style={{ color: "var(--muted)" }}>loose notes</span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          paddingTop: 4,
          borderTop: "1px solid var(--border)",
          fontSize: 10,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--accent)",
              display: "inline-block",
            }}
          />
          focus
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--accent2)",
              display: "inline-block",
            }}
          />
          imp≥8
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--panel2)",
              border: "1px solid var(--accent)",
              display: "inline-block",
            }}
          />
          note
        </span>
      </div>
    </div>
  );
}
