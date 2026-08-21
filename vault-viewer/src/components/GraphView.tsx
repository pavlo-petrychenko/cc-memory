import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Graph } from "../types";

// Obsidian-inspired palette — 10 distinct, works in console dark + light
const FEATURE_PALETTE = [
  "#6C5CFF", // violet (accent)
  "#2A9D8F", // teal
  "#E6A03F", // amber
  "#FF4D4D", // red
  "#3B82F6", // blue
  "#A3FFB5", // phosphor green
  "#F97316", // orange
  "#8B5CF6", // purple
  "#06B6D4", // cyan
  "#84CC16", // lime
] as const;

type GraphNode = {
  id: string;
  title: string;
  type: string;
  importance: number | null;
  tags: string;
  feature: string;
  color: string;
  degree: number;
  isFocus: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type GraphEdge = {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: string;
  sameFeature: boolean;
};

type Config = {
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  collideRadius: number;
  clusterStrength: number;
  centerStrength: number;
};

const DEFAULT_CONFIG: Config = {
  linkDistance: 72,
  linkStrength: 0.55,
  chargeStrength: -140,
  collideRadius: 10,
  clusterStrength: 0.18,
  centerStrength: 0.08,
};

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem("consoleGraphConfig");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

export function GraphView({
  graph,
  focus,
  onSelect,
  full,
  setFull,
  depth,
  setDepth,
  typeFilter,
  tagFilter,
  featureFilter,
  setTypeFilter,
  setTagFilter,
  setFeatureFilter,
}: {
  graph: Graph | null;
  focus: string | null;
  onSelect: (id: string) => void;
  full: boolean;
  setFull: (v: boolean) => void;
  depth: number;
  setDepth: (n: number) => void;
  typeFilter?: string;
  tagFilter?: string;
  featureFilter?: string;
  setTypeFilter?: (v: string) => void;
  setTagFilter?: (v: string) => void;
  setFeatureFilter?: (v: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [tick, setTick] = useState(0);
  // nodes/edges with simulation state
  const [simNodes, setSimNodes] = useState<GraphNode[]>([]);
  const [simEdges, setSimEdges] = useState<GraphEdge[]>([]);

  useEffect(() => {
    localStorage.setItem("consoleGraphConfig", JSON.stringify(config));
  }, [config]);

  const raw = graph ?? { nodes: [], edges: [] };

  const { nodesFiltered, edgesFiltered, featureColor, featureList } = useMemo(() => {
    const nodes = (raw.nodes as any[]).filter((n: any) => {
      if (typeFilter && n.type !== typeFilter) return false;
      if (tagFilter && !(n.tags ?? "").split(/\s+/).includes(tagFilter)) return false;
      const feat = (n.id.split("/")[0] ?? "").toLowerCase();
      if (featureFilter && feat !== featureFilter.toLowerCase()) return false;
      return true;
    });
    const visibleIds = new Set(nodes.map((n: any) => n.id));
    const edges = (raw.edges as any[]).filter((e: any) => visibleIds.has(e.source) && visibleIds.has(e.target));
    // feature -> color
    const feats = Array.from(new Set(nodes.map((n: any) => (n.id.split("/")[0] ?? "")))).filter(Boolean).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    const map = new Map<string, string>();
    feats.forEach((f, i) => map.set(f, FEATURE_PALETTE[i % FEATURE_PALETTE.length]!));
    // loose notes (no slash or empty) -> muted
    map.set("", "#7A7A85");
    map.set("loose", "#7A7A85");
    return { nodesFiltered: nodes, edgesFiltered: edges, featureColor: map, featureList: feats };
  }, [raw.nodes, raw.edges, typeFilter, tagFilter, featureFilter]);

  // Build sim nodes/edges when filtered data changes
  useEffect(() => {
    const degree = new Map<string, number>();
    for (const e of edgesFiltered as any[]) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const w = 900, h = 520, cx = w / 2, cy = h / 2;
    // cluster centers for features in a ring
    const clusterCount = Math.max(1, featureList.length);
    const clusterPos = new Map<string, { x: number; y: number }>();
    featureList.forEach((f, i) => {
      const angle = (i / clusterCount) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(w, h) * 0.28;
      clusterPos.set(f, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    });
    // loose stays at center
    clusterPos.set("", { x: cx, y: cy });

    const nodes: GraphNode[] = (nodesFiltered as any[]).map((n: any) => {
      const feature = n.id.includes("/") ? n.id.split("/")[0]! : "";
      const color = featureColor.get(feature) ?? "#7A7A85";
      const isFocus = n.id === focus;
      const deg = degree.get(n.id) ?? 0;
      // initial position: jitter around cluster center or center if no cluster
      const cluster = clusterPos.get(feature) ?? { x: cx, y: cy };
      const jitterR = 40 + Math.random() * 60;
      const jitterA = Math.random() * Math.PI * 2;
      return {
        id: n.id,
        title: n.title,
        type: n.type,
        importance: n.importance,
        tags: n.tags,
        feature,
        color,
        degree: deg,
        isFocus,
        x: isFocus ? cx : cluster.x + Math.cos(jitterA) * jitterR + (Math.random() - 0.5) * 30,
        y: isFocus ? cy : cluster.y + Math.sin(jitterA) * jitterR + (Math.random() - 0.5) * 30,
      };
    });

    const edges: GraphEdge[] = (edgesFiltered as any[]).map((e: any) => {
      const sFeat = e.source.includes("/") ? e.source.split("/")[0] : "";
      const tFeat = e.target.includes("/") ? e.target.split("/")[0] : "";
      return {
        source: e.source,
        target: e.target,
        relationType: e.relationType,
        sameFeature: sFeat !== "" && sFeat === tFeat,
      };
    });

    setSimNodes(nodes);
    setSimEdges(edges);
  }, [nodesFiltered, edgesFiltered, featureColor, featureList, focus]);

  // Simulation
  useEffect(() => {
    if (simNodes.length === 0) return;
    const w = 900, h = 520, cx = w / 2, cy = h / 2;

    // cluster centers again for forceX/Y
    const clusterCount = Math.max(1, featureList.length);
    const clusterX = new Map<string, number>();
    const clusterY = new Map<string, number>();
    featureList.forEach((f, i) => {
      const angle = (i / clusterCount) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(w, h) * 0.26;
      clusterX.set(f, cx + Math.cos(angle) * r);
      clusterY.set(f, cy + Math.sin(angle) * r);
    });
    clusterX.set("", cx);
    clusterY.set("", cy);

    // stop old
    if (simRef.current) simRef.current.stop();

    const sim = d3
      .forceSimulation<GraphNode, GraphEdge>(simNodes as any)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(simEdges as any)
          .id((d: any) => d.id)
          .distance((d: any) => (d.sameFeature ? config.linkDistance * 0.62 : config.linkDistance))
          .strength((d: any) => (d.sameFeature ? Math.min(1, config.linkStrength * 1.45) : config.linkStrength * 0.72))
      )
      .force("charge", d3.forceManyBody<GraphNode>().strength(config.chargeStrength))
      .force("center", d3.forceCenter<GraphNode>(cx, cy).strength(config.centerStrength))
      .force(
        "collide",
        d3.forceCollide<GraphNode>().radius((d) => (d.isFocus ? 18 : d.importance !== null && d.importance >= 8 ? 13 : 9) + config.collideRadius).strength(0.75)
      )
      .force(
        "x",
        d3
          .forceX<GraphNode>((d) => clusterX.get(d.feature) ?? cx)
          .strength((d) => (d.isFocus ? 0.02 : config.clusterStrength * 0.9))
      )
      .force(
        "y",
        d3
          .forceY<GraphNode>((d) => clusterY.get(d.feature) ?? cy)
          .strength((d) => (d.isFocus ? 0.02 : config.clusterStrength * 0.9))
      )
      .alpha(0.9)
      .alphaDecay(0.028)
      .velocityDecay(0.32);

    // keep focus node more stable but not fixed — slight pull to center
    const focusNode = simNodes.find((n) => n.isFocus);
    if (focusNode) {
      // gentle gravity to center for focus
      sim.force("focusX", d3.forceX<GraphNode>(cx).strength(0.06).x((d) => (d.isFocus ? cx : (clusterX.get(d.feature) ?? cx))));
      sim.force("focusY", d3.forceY<GraphNode>(cy).strength(0.06).y((d) => (d.isFocus ? cy : (clusterY.get(d.feature) ?? cy))));
    }

    sim.on("tick", () => {
      // clamp to bounds with padding
      const pad = 24;
      for (const n of simNodes) {
        if (n.fx == null) n.x = Math.max(pad, Math.min(w - pad, n.x ?? cx));
        if (n.fy == null) n.y = Math.max(pad, Math.min(h - pad, n.y ?? cy));
      }
      setTick((t) => t + 1);
    });

    simRef.current = sim as any;

    return () => {
      sim.stop();
    };
  }, [simNodes, simEdges, config, featureList, focus]);

  // Zoom + pan
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.18, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom as any);
    // double-click to reset
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => {
      svg.transition().duration(400).call((zoom as any).transform, d3.zoomIdentity);
    });
    return () => {
      svg.on(".zoom", null);
    };
  }, [simNodes.length]);

  // Drag
  useEffect(() => {
    if (!gRef.current || !simRef.current) return;
    const sim = simRef.current;
    const nodesSel = d3.select(gRef.current).selectAll<SVGGElement, GraphNode>("g.node");

    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active && sim) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active && sim) sim.alphaTarget(0);
        // keep fixed where dropped — user can double-click node to unpin
        // leave fx/fy set (pinned)
      });

    nodesSel.call(drag as any);

    // double-click to unpin
    nodesSel.on("dblclick", (_event: any, d: GraphNode) => {
      d.fx = null;
      d.fy = null;
      if (sim) sim.alpha(0.4).restart();
    });

    return () => {
      nodesSel.on(".drag", null);
      nodesSel.on("dblclick", null);
    };
  }, [tick, simNodes.length]); // re-bind when nodes change / tick updates

  if (!graph) return <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}>Loading graph…</div>;

  const width = 900, height = 520;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, background: "var(--accent)", borderRadius: 2, display: "inline-block" }} />
          Graph
        </span>
        <span style={{ fontSize: 11, background: "var(--panel2)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, color: "var(--muted)" }}>
          {simNodes.length} nodes · {simEdges.length} edges
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
          Depth
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            style={{ background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
          </select>
        </label>
        {setTypeFilter && (
          <input
            value={typeFilter ?? ""}
            onChange={(e) => setTypeFilter(e.target.value)}
            placeholder="type:spec"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, width: 90, color: "var(--text)", fontFamily: "Fragment Mono" }}
          />
        )}
        {setTagFilter && (
          <input
            value={tagFilter ?? ""}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="tag:auth"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, width: 90, color: "var(--text)", fontFamily: "Fragment Mono" }}
          />
        )}
        {setFeatureFilter && (
          <input
            value={featureFilter ?? ""}
            onChange={(e) => setFeatureFilter(e.target.value)}
            placeholder="feature:auth"
            list="graph-features"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, width: 110, color: "var(--text)", fontFamily: "Fragment Mono" }}
          />
        )}
        <datalist id="graph-features">
          {featureList.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <button
          onClick={() => setShowSettings((v) => !v)}
          style={{
            background: showSettings ? "var(--accent)" : "var(--panel2)",
            color: showSettings ? "#fff" : "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
          title="Graph physics"
        >
          ⚙ Config
        </button>
        <button
          onClick={() => setFull(!full)}
          style={{
            marginLeft: "auto",
            background: full ? "var(--accent)" : "var(--panel2)",
            color: full ? "#fff" : "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {full ? "→ Focused" : "→ Full vault"}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ background: "var(--panel2)", borderBottom: "1px solid var(--border)", padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 18px" }}>
          {[
            { key: "linkDistance" as const, label: "Link distance", min: 24, max: 160, step: 2 },
            { key: "linkStrength" as const, label: "Link strength", min: 0.05, max: 1, step: 0.05 },
            { key: "chargeStrength" as const, label: "Repulsion", min: -420, max: -20, step: 10 },
            { key: "collideRadius" as const, label: "Collision", min: 2, max: 22, step: 1 },
            { key: "clusterStrength" as const, label: "Cluster (same feature)", min: 0, max: 0.5, step: 0.02 },
            { key: "centerStrength" as const, label: "Center gravity", min: 0, max: 0.4, step: 0.02 },
          ].map((f) => (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
              Same-feature nodes & linked nodes attract stronger. Drag nodes to pin (double-click to unpin) • Scroll to zoom • Drag background to pan • Double-click background to reset zoom.
            </span>
            <button
              onClick={() => setConfig(DEFAULT_CONFIG)}
              style={{ marginLeft: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--muted)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Reset defaults
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", background: "var(--bg)", overflow: "hidden" }}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}>
          <g ref={gRef}>
            {/* edges */}
            {simEdges.map((e: any, i) => {
              const s = typeof e.source === "object" ? e.source : simNodes.find((n) => n.id === e.source);
              const t = typeof e.target === "object" ? e.target : simNodes.find((n) => n.id === e.target);
              if (!s || !t || s.x == null || t.x == null) return null;
              const same = (e as GraphEdge).sameFeature;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={same ? (s.color ?? "var(--accent)") : "var(--border)"}
                  strokeWidth={same ? 1.6 : 1}
                  opacity={same ? 0.75 : 0.45}
                />
              );
            })}
            {/* nodes */}
            {simNodes.map((n) => {
              const isHigh = n.importance !== null && n.importance >= 8;
              const r = n.isFocus ? 13 : isHigh ? 10 : 7.5;
              const pinned = n.fx != null;
              return (
                <g
                  key={n.id}
                  className="node"
                  onClick={() => onSelect(n.id)}
                  style={{ cursor: "pointer" }}
                  // store id for d3 drag binding
                >
                  {/* halo for focus */}
                  {n.isFocus && <circle cx={n.x} cy={n.y} r={r + 7} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.35} style={{ pointerEvents: "none" }} />}
                  {/* pinned ring */}
                  {pinned && <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke="var(--amber)" strokeWidth={1.2} strokeDasharray="3 2" opacity={0.7} style={{ pointerEvents: "none" }} />}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={n.color}
                    stroke={n.isFocus ? "#fff" : isHigh ? "#fff" : "var(--bg)"}
                    strokeWidth={n.isFocus ? 2.2 : isHigh ? 1.4 : 1}
                    style={{
                      filter: n.isFocus ? "drop-shadow(0 0 10px var(--accent))" : isHigh ? "drop-shadow(0 0 6px rgba(163,255,181,.6))" : undefined,
                    }}
                  />
                  {/* degree dot */}
                  {n.degree > 3 && (
                    <circle cx={(n.x ?? 0) + r * 0.7} cy={(n.y ?? 0) - r * 0.7} r={3.2} fill="var(--bg)" stroke={n.color} strokeWidth={1} />
                  )}
                  <text
                    x={n.x}
                    y={(n.y ?? 0) + r + 13}
                    textAnchor="middle"
                    fontSize={n.isFocus ? 11 : 9.5}
                    fontWeight={n.isFocus ? 600 : 400}
                    fill={n.isFocus ? "var(--text)" : "var(--muted)"}
                    fontFamily="Fragment Mono"
                    style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3, strokeLinejoin: "round" }}
                  >
                    {n.title.slice(0, 20)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* legend */}
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
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 2, background: "var(--accent)", display: "inline-block", borderRadius: 2 }} />
            Feature colors
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
            {featureList.slice(0, 10).map((f) => (
              <span key={f} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: featureColor.get(f), display: "inline-block", border: "1px solid rgba(0,0,0,.15)" }} />
                {f}
              </span>
            ))}
            {featureList.length === 0 && <span style={{ color: "var(--muted)" }}>loose notes</span>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 4, borderTop: "1px solid var(--border)", fontSize: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)", display: "inline-block" }} />
              focus
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent2)", display: "inline-block" }} />
              imp≥8
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--accent)", display: "inline-block" }} />
              note
            </span>
          </div>
        </div>

        {/* hint */}
        <div style={{ position: "absolute", top: 10, right: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
          <span>drag node to pin</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>dbl-click to unpin</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
