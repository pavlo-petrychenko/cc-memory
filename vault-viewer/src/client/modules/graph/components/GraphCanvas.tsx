import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type GraphNode = {
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

export type GraphEdge = {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: string;
  sameFeature: boolean;
};

export type GraphConfig = {
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  collideRadius: number;
  clusterStrength: number;
  centerStrength: number;
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  config: GraphConfig;
  featureList: string[];
  focus: string | null;
  onSelect: (id: string) => void;
};

const WIDTH = 900;
const HEIGHT = 520;

export default function GraphCanvas({
  nodes,
  edges,
  config,
  featureList,
  onSelect,
}: Props): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const rafRef = useRef<number>(0);
  const [frame, setFrame] = useState(0);

  // Clone nodes/edges so D3 can mutate without affecting props
  const simNodes = useMemo<GraphNode[]>(() => {
    // degree already computed upstream; ensure mutable copy
    return nodes.map((n) => ({ ...n }));
  }, [nodes]);

  const simEdges = useMemo<GraphEdge[]>(() => {
    return edges.map((e) => ({ ...e }));
  }, [edges]);

  useEffect(() => {
    if (simNodes.length === 0) return;

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    const clusterX = new Map<string, number>();
    const clusterY = new Map<string, number>();
    const clusterCount = Math.max(1, featureList.length);
    featureList.forEach((f, i) => {
      const angle = (i / clusterCount) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(WIDTH, HEIGHT) * 0.26;
      clusterX.set(f, cx + Math.cos(angle) * r);
      clusterY.set(f, cy + Math.sin(angle) * r);
    });
    clusterX.set("", cx);
    clusterY.set("", cy);

    if (simRef.current) simRef.current.stop();

    const sim = d3
      .forceSimulation<GraphNode, GraphEdge>(simNodes as unknown as GraphNode[])
      .force(
        "link",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (
          d3.forceLink as unknown as (
            edges: unknown,
          ) => d3.ForceLink<GraphNode, GraphEdge>
        )(simEdges as unknown)
          .id((d) => (d as GraphNode).id)
          .distance((d) =>
            (d as GraphEdge).sameFeature
              ? config.linkDistance * 0.62
              : config.linkDistance,
          )
          .strength((d) =>
            (d as GraphEdge).sameFeature
              ? Math.min(1, config.linkStrength * 1.45)
              : config.linkStrength * 0.72,
          ),
      )
      .force("charge", d3.forceManyBody<GraphNode>().strength(config.chargeStrength))
      .force("center", d3.forceCenter<GraphNode>(cx, cy).strength(config.centerStrength))
      .force(
        "collide",
        d3
          .forceCollide<GraphNode>()
          .radius(
            (d) =>
              (d.isFocus ? 18 : d.importance !== null && d.importance >= 8 ? 13 : 9) +
              config.collideRadius,
          )
          .strength(0.75),
      )
      .force(
        "x",
        d3
          .forceX<GraphNode>((d) => clusterX.get(d.feature) ?? cx)
          .strength((d) => (d.isFocus ? 0.02 : config.clusterStrength * 0.9)),
      )
      .force(
        "y",
        d3
          .forceY<GraphNode>((d) => clusterY.get(d.feature) ?? cy)
          .strength((d) => (d.isFocus ? 0.02 : config.clusterStrength * 0.9)),
      )
      .alpha(0.9)
      .alphaDecay(0.028)
      .velocityDecay(0.32);

    const focusNode = simNodes.find((n) => n.isFocus);
    if (focusNode) {
      sim
        .force(
          "focusX",
          d3
            .forceX<GraphNode>(cx)
            .strength(0.06)
            .x((d) => (d.isFocus ? cx : (clusterX.get(d.feature) ?? cx))),
        )
        .force(
          "focusY",
          d3
            .forceY<GraphNode>(cy)
            .strength(0.06)
            .y((d) => (d.isFocus ? cy : (clusterY.get(d.feature) ?? cy))),
        );
    }

    sim.on("tick", () => {
      const pad = 24;
      for (const n of simNodes) {
        if (n.fx == null) n.x = Math.max(pad, Math.min(WIDTH - pad, n.x ?? cx));
        if (n.fy == null) n.y = Math.max(pad, Math.min(HEIGHT - pad, n.y ?? cy));
      }
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setFrame((f) => f + 1));
    });

    simRef.current = sim;

    return () => {
      sim.stop();
      cancelAnimationFrame(rafRef.current);
    };
  }, [simNodes, simEdges, config, featureList]);

  // Zoom
  useEffect(() => {
    const svgEl = svgRef.current;
    const gEl = gRef.current;
    if (!svgEl || !gEl) return;
    const svg = d3.select(svgEl) as unknown as d3.Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;
    const g = d3.select(gEl);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.18, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });
    (svg as unknown as { call: (fn: unknown) => void }).call(zoom);
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => {
      svg
        .transition()
        .duration(400)
        .call(zoom.transform as unknown as never, d3.zoomIdentity as never);
    });
    return () => {
      svg.on(".zoom", null);
      svg.on("dblclick", null);
    };
  }, [simNodes.length]);

  // Drag
  useEffect(() => {
    const gEl = gRef.current;
    const sim = simRef.current;
    if (!gEl || !sim) return;
    const sel = d3.select(gEl).selectAll<SVGGElement, GraphNode>("g.node");
    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x ?? null;
        d.fy = d.y ?? null;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event) => {
        if (!event.active) sim.alphaTarget(0);
      });
    (sel as unknown as { call: (fn: unknown) => void }).call(drag);
    sel.on("dblclick", (_event, d) => {
      d.fx = null;
      d.fy = null;
      sim.alpha(0.4).restart();
    });
    return () => {
      sel.on(".drag", null);
      sel.on("dblclick", null);
    };
    // frame ensures rebind after tick updates node positions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, simNodes.length]);

  // Ensure nodes have positions even before first tick
  void frame;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
    >
      <g ref={gRef}>
        {simEdges.map((e, i) => {
          const s =
            typeof e.source === "object"
              ? (e.source as GraphNode)
              : simNodes.find((n) => n.id === e.source);
          const t =
            typeof e.target === "object"
              ? (e.target as GraphNode)
              : simNodes.find((n) => n.id === e.target);
          if (!s || !t || s.x == null || s.y == null || t.x == null || t.y == null)
            return null;
          const same = e.sameFeature;
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
            >
              {n.isFocus ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 7}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1}
                  opacity={0.35}
                  style={{ pointerEvents: "none" }}
                />
              ) : null}
              {pinned ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 3}
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth={1.2}
                  strokeDasharray="3 2"
                  opacity={0.7}
                  style={{ pointerEvents: "none" }}
                />
              ) : null}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={n.color}
                stroke={n.isFocus ? "#fff" : isHigh ? "#fff" : "var(--bg)"}
                strokeWidth={n.isFocus ? 2.2 : isHigh ? 1.4 : 1}
                style={{
                  filter: n.isFocus
                    ? "drop-shadow(0 0 10px var(--accent))"
                    : isHigh
                      ? "drop-shadow(0 0 6px rgba(163,255,181,.6))"
                      : undefined,
                }}
              />
              {n.degree > 3 ? (
                <circle
                  cx={(n.x ?? 0) + r * 0.7}
                  cy={(n.y ?? 0) - r * 0.7}
                  r={3.2}
                  fill="var(--bg)"
                  stroke={n.color}
                  strokeWidth={1}
                />
              ) : null}
              <text
                x={n.x}
                y={(n.y ?? 0) + r + 13}
                textAnchor="middle"
                fontSize={n.isFocus ? 11 : 9.5}
                fontWeight={n.isFocus ? 600 : 400}
                fill={n.isFocus ? "var(--text)" : "var(--muted)"}
                fontFamily="Fragment Mono"
                style={{
                  pointerEvents: "none",
                  paintOrder: "stroke",
                  stroke: "var(--bg)",
                  strokeWidth: 3,
                  strokeLinejoin: "round",
                }}
              >
                {n.title.slice(0, 20)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
