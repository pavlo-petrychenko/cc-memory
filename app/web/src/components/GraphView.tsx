import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Graph } from "../api/client.ts";

type Props = {
  graph: Graph | null;
  worklogGraph?: Graph | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

type SimNode = d3.SimulationNodeDatum & {
  id: string;
  title: string;
  type: string;
  importance: number | null;
  feature: string;
};

type SimLink = d3.SimulationLinkDatum<SimNode> & {
  source: string | SimNode;
  target: string | SimNode;
  relType: string;
};

const COLOR_SELECTED = "#7c86ff";
const COLOR_EDGE = "#2a303c";
const COLOR_LABEL = "#c9d1de";
const COLOR_LOOSE = "#8b95a5";

const GROUP_PALETTE = [
  "#ff6b6b", // red
  "#51cf66", // green
  "#339af0", // blue
  "#fcc419", // yellow
  "#cc5de8", // violet
  "#22b8cf", // cyan
  "#ff922b", // orange
  "#a9e34b", // lime
  "#748ffc", // indigo
  "#ff8787", // coral
  "#20c997", // teal
  "#f59f00", // amber
] as const;

function resolveTargetId(dst: string, nodeIds: Set<string>): string | null {
  const rawNoMd = dst.endsWith(".md") ? dst.slice(0, -3) : dst;
  const candidates = [dst, `${rawNoMd}.md`, `${rawNoMd}/${rawNoMd.split("/").pop()}.md`];
  for (const c of candidates) if (nodeIds.has(c)) return c;
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  for (const lc of lowerCandidates) {
    for (const id of nodeIds) if (id.toLowerCase() === lc) return id;
  }
  const lowerRaw = rawNoMd.toLowerCase();
  const targetLast = rawNoMd.split("/").pop()!.toLowerCase();
  // Prefer folder index
  const idxPath = `${targetLast}/${targetLast}.md`;
  for (const id of nodeIds) if (id.toLowerCase() === idxPath) return id;
  // Stem match
  for (const id of nodeIds) {
    const stem = id.split("/").pop()!.replace(/\.md$/, "").toLowerCase();
    if (stem === targetLast) return id;
  }
  for (const id of nodeIds) if (id.toLowerCase().endsWith(`/${targetLast}.md`)) return id;
  return null;
}

export function GraphView({ graph, worklogGraph = null, selectedPath, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const linkSelRef = useRef<d3.Selection<
    SVGLineElement,
    SimLink,
    SVGGElement,
    unknown
  > | null>(null);
  const nodeSelRef = useRef<d3.Selection<
    SVGGElement,
    SimNode,
    SVGGElement,
    unknown
  > | null>(null);
  const labelSelRef = useRef<d3.Selection<
    SVGTextElement,
    SimNode,
    SVGGElement,
    unknown
  > | null>(null);

  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [showLabels, setShowLabels] = useState(false);
  const [edgeMode, setEdgeMode] = useState<"all" | "neighbors">("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const [showWorklogs, setShowWorklogs] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cc-memory:graph:showWorklogs");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:graph:showWorklogs", showWorklogs ? "1" : "0");
    } catch {
      // ignore
    }
  }, [showWorklogs]);
  const [showTuning, setShowTuning] = useState(false);

  const DEFAULT_TUNING = useMemo(
    () => ({
      cluster: 0.14,
      linkDistance: 34,
      linkStrength: 0.85,
      repulsion: -72,
      collidePadding: 10,
    }),
    [],
  );
  const [tuning, setTuning] = useState(() => {
    try {
      const raw = localStorage.getItem("cc-memory:graph:tuning");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_TUNING>;
        return {
          cluster: typeof parsed.cluster === "number" ? parsed.cluster : 0.14,
          linkDistance:
            typeof parsed.linkDistance === "number" ? parsed.linkDistance : 34,
          linkStrength:
            typeof parsed.linkStrength === "number" ? parsed.linkStrength : 0.85,
          repulsion: typeof parsed.repulsion === "number" ? parsed.repulsion : -72,
          collidePadding:
            typeof parsed.collidePadding === "number" ? parsed.collidePadding : 10,
        };
      }
    } catch {
      // ignore
    }
    return {
      cluster: 0.14,
      linkDistance: 34,
      linkStrength: 0.85,
      repulsion: -72,
      collidePadding: 10,
    };
  });
  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:graph:tuning", JSON.stringify(tuning));
    } catch {
      // ignore
    }
  }, [tuning]);

  const mergedGraph = useMemo(() => {
    if (graph === null) return null;
    if (!showWorklogs || !worklogGraph) return graph;
    return {
      nodes: [...graph.nodes, ...worklogGraph.nodes],
      edges: [...graph.edges, ...worklogGraph.edges],
    } as Graph;
  }, [graph, worklogGraph, showWorklogs]);

  const features = useMemo(() => {
    if (mergedGraph === null) return [];
    const set = new Set(mergedGraph.nodes.map((n) => n.feature).filter((f) => f !== ""));
    return [...set].toSorted();
  }, [mergedGraph]);

  const groupColor = useMemo(() => {
    const map = new Map<string, string>();
    features.forEach((f, i) => map.set(f, GROUP_PALETTE[i % GROUP_PALETTE.length]!));
    map.set("", COLOR_LOOSE);
    // Worklog groups get distinct but slightly dimmer variant — keep same palette but offset
    return map;
  }, [features]);

  // Only filter by feature here — neighbor dimming is visual only, so selection doesn't rebuild the simulation
  const filteredGraph = useMemo(() => {
    if (mergedGraph === null) return null;
    const baseNodes =
      featureFilter === "all"
        ? mergedGraph.nodes
        : mergedGraph.nodes.filter((n) => n.feature === featureFilter);
    return { nodes: baseNodes, edges: mergedGraph.edges };
  }, [mergedGraph, featureFilter]);

  // Keep latest onSelect without retriggering simulation
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // ---- Simulation lifecycle: only when filteredGraph changes (feature filter), NOT on hover/selection ----
  useEffect(() => {
    if (
      filteredGraph === null ||
      svgRef.current === null ||
      containerRef.current === null
    )
      return;

    const svgEl = svgRef.current;
    const svg = d3.select(svgEl);
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = Math.max(container.clientHeight, 520, rect.height, 620);
    // Use actual container height for full-bleed graph
    const h = container.clientHeight > 0 ? container.clientHeight : 620;
    svg.attr("viewBox", `0 0 ${width} ${h}`);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 6])
      .filter((event: unknown) => {
        const e = event as MouseEvent;
        // Don't zoom when dragging a node (drag will handle it)
        return !(
          e.target instanceof Element &&
          (e.target as Element).closest("[data-node]") !== null &&
          e.type === "mousedown"
        );
      })
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });
    svg.call(
      zoom as unknown as (
        selection: d3.Selection<SVGSVGElement, unknown, null, undefined>,
      ) => void,
    );
    // Obsidian-like: start zoomed out so everything fits with padding — fit after a short settle
    const fitTimer = window.setTimeout(() => {
      const nodesList = simulation.nodes();
      if (nodesList.length === 0) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of nodesList) {
        if (n.x === undefined || n.y === undefined) continue;
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;
      const dx = maxX - minX;
      const dy = maxY - minY;
      if (dx < 10 || dy < 10) return;
      const padding = 56;
      const scale = Math.min((width - padding * 2) / dx, (h - padding * 2) / dy, 1.15);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const transform = d3.zoomIdentity
        .translate(width / 2, h / 2)
        .scale(scale)
        .translate(-cx, -cy);
      svg
        .transition()
        .duration(650)
        .call(
          zoom.transform as unknown as (
            selection: d3.Selection<SVGSVGElement, unknown, null, undefined>,
            transform: d3.ZoomTransform,
          ) => void,
          transform,
        );
    }, 720);

    const nodeIds = new Set(filteredGraph.nodes.map((n) => n.id));

    const links: SimLink[] = [];
    for (const edge of filteredGraph.edges) {
      if (!nodeIds.has(edge.src)) continue;
      const resolvedDst = resolveTargetId(edge.dst, nodeIds);
      if (resolvedDst === null) continue;
      links.push({ source: edge.src, target: resolvedDst, relType: edge.relType });
    }

    const nodes: SimNode[] = filteredGraph.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      importance: n.importance,
      feature: n.feature,
    }));

    // Group anchors spread on a circle — Obsidian-like clustering
    const visibleFeatures = features.filter((f) =>
      filteredGraph.nodes.some((n) => n.feature === f),
    );
    const groupCount = visibleFeatures.length || 1;
    const anchorRadius = Math.min(width, h) * 0.32;
    const anchors = new Map<string, { x: number; y: number }>();
    visibleFeatures.forEach((f, i) => {
      const angle = (i / groupCount) * Math.PI * 2 - Math.PI / 2;
      anchors.set(f, {
        x: width / 2 + Math.cos(angle) * anchorRadius,
        y: h / 2 + Math.sin(angle) * anchorRadius,
      });
    });
    anchors.set("", { x: width / 2, y: h / 2 });

    // Random around group anchor — no more square grid
    nodes.forEach((n) => {
      const a = anchors.get(n.feature) ?? anchors.get("")!;
      n.x = a.x + (Math.random() - 0.5) * 90;
      n.y = a.y + (Math.random() - 0.5) * 90;
    });

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const s = typeof d.source === "string" ? null : (d.source as SimNode);
            const t = typeof d.target === "string" ? null : (d.target as SimNode);
            if (s && t && s.feature !== "" && s.feature === t.feature)
              return tuning.linkDistance;
            return Math.round(tuning.linkDistance * 2.35);
          })
          .strength((d) => {
            const s = typeof d.source === "string" ? null : (d.source as SimNode);
            const t = typeof d.target === "string" ? null : (d.target as SimNode);
            if (s && t && s.feature !== "" && s.feature === t.feature)
              return tuning.linkStrength;
            return Math.max(0.02, tuning.linkStrength * 0.12);
          }),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(tuning.repulsion))
      .force("center", d3.forceCenter<SimNode>(width / 2, h / 2))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((d) => {
            const base = d.importance !== null ? 6 + Math.min(d.importance, 10) * 0.6 : 7;
            return base + tuning.collidePadding;
          })
          .strength(0.9),
      )
      .force(
        "x",
        d3
          .forceX<SimNode>((d) => anchors.get((d as SimNode).feature)?.x ?? width / 2)
          .strength(tuning.cluster),
      )
      .force(
        "y",
        d3
          .forceY<SimNode>((d) => anchors.get((d as SimNode).feature)?.y ?? h / 2)
          .strength(tuning.cluster),
      )
      .alpha(0.9)
      .alphaDecay(0.035)
      .alphaMin(0.01)
      .velocityDecay(0.45);

    simRef.current = simulation;

    const edgeGroup = g.append("g").attr("stroke-linecap", "round");
    const linkSel = edgeGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", COLOR_EDGE)
      .attr("stroke-width", (d) => (d.relType === "links_to" ? 1 : 1.25));

    const nodeGroup = g.append("g");
    const nodeSel = nodeGroup
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("data-node", "1")
      .style("cursor", "pointer");

    nodeSel
      .append("circle")
      .attr("data-circle", "1")
      .attr("r", (d) =>
        d.importance !== null ? 5 + Math.min(d.importance, 10) * 0.7 : 7,
      )
      .attr("fill", (d) => groupColor.get(d.feature) ?? COLOR_LOOSE)
      .attr("stroke", "#0f1115")
      .attr("stroke-width", 1.8);

    const labelSel = nodeSel
      .append("text")
      .text((d) => (d.title.length > 22 ? `${d.title.slice(0, 22)}…` : d.title))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => {
        const r = d.importance !== null ? 5 + Math.min(d.importance, 10) * 0.7 : 7;
        return r + 14;
      })
      .attr("font-size", 10)
      .attr("font-family", "ui-monospace, SF Mono, monospace")
      .attr("stroke", "#0d0f13")
      .attr("stroke-width", 0.7)
      .attr("paint-order", "stroke")
      .attr("pointer-events", "none")
      .style("user-select", "none");

    nodeSel
      .append("title")
      .text((d) => `${d.title}\n${d.id}\nfeature: ${d.feature || "—"}`);

    linkSelRef.current = linkSel;
    nodeSelRef.current = nodeSel;
    labelSelRef.current = labelSel;

    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.15).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    (nodeSel as unknown as d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>).call(
      drag as unknown as (
        selection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>,
      ) => void,
    );

    nodeSel
      .on("click", (_event, d) => {
        // Prevent zoom click-through
        _event.stopPropagation();
        onSelectRef.current(d.id);
      })
      .on("mouseenter", (_event, d) => setHovered(d.id))
      .on("mouseleave", () => setHovered(null));

    // Click on background clears or does nothing — don't restart simulation
    svg.on("click", () => {
      // no-op, just to capture clicks for zoom
    });

    const clampMargin = 26;
    simulation.on("tick", () => {
      for (const n of nodes) {
        const r = n.importance !== null ? 5 + Math.min(n.importance, 10) * 0.7 : 7;
        const m = clampMargin + r;
        if (n.x !== undefined) n.x = Math.max(m, Math.min(width - m, n.x));
        if (n.y !== undefined) n.y = Math.max(m, Math.min(h - m, n.y));
      }
      linkSel
        .attr("x1", (d) =>
          typeof d.source === "string" ? 0 : ((d.source as SimNode).x ?? 0),
        )
        .attr("y1", (d) =>
          typeof d.source === "string" ? 0 : ((d.source as SimNode).y ?? 0),
        )
        .attr("x2", (d) =>
          typeof d.target === "string" ? 0 : ((d.target as SimNode).x ?? 0),
        )
        .attr("y2", (d) =>
          typeof d.target === "string" ? 0 : ((d.target as SimNode).y ?? 0),
        );
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      window.clearTimeout(fitTimer);
      simulation.stop();
      svg.on(".zoom", null);
      simRef.current = null;
      linkSelRef.current = null;
      nodeSelRef.current = null;
      labelSelRef.current = null;
    };
  }, [filteredGraph, tuning]);

  // ---- Visual updates only (no simulation restart) for hover/selection/edgeMode/showLabels ----
  useEffect(() => {
    const nodeSel = nodeSelRef.current;
    const linkSel = linkSelRef.current;
    const labelSel = labelSelRef.current;
    if (
      nodeSel === null ||
      linkSel === null ||
      labelSel === null ||
      filteredGraph === null
    )
      return;

    // Build neighbor set for selected
    const nodeIds = new Set(filteredGraph.nodes.map((n) => n.id));
    const linksData = linkSel.data() as SimLink[];
    const activeNodeIds = new Set<string>();
    if (selectedPath !== null && nodeIds.has(selectedPath)) {
      activeNodeIds.add(selectedPath);
      for (const link of linksData) {
        const srcId =
          typeof link.source === "string" ? link.source : (link.source as SimNode).id;
        const dstId =
          typeof link.target === "string" ? link.target : (link.target as SimNode).id;
        if (srcId === selectedPath) activeNodeIds.add(dstId);
        if (dstId === selectedPath) activeNodeIds.add(srcId);
      }
    }
    if (hovered !== null) activeNodeIds.add(hovered);
    const isDimming =
      edgeMode === "neighbors" && selectedPath !== null && activeNodeIds.size > 1;

    // Update node fills — group color, selected gets highlight ring
    nodeSel
      .select<SVGCircleElement>("circle[data-circle]")
      .attr("fill", (d) => groupColor.get((d as SimNode).feature) ?? COLOR_LOOSE)
      .attr("stroke", (d) =>
        (d as SimNode).id === selectedPath ? COLOR_SELECTED : "#0f1115",
      )
      .attr("stroke-width", (d) => ((d as SimNode).id === selectedPath ? 2.8 : 1.8))
      .attr("fill-opacity", (d) => {
        const node = d as SimNode;
        if (isDimming && !activeNodeIds.has(node.id)) return 0.14;
        return 1;
      })
      .attr("stroke-opacity", (d) => {
        const node = d as SimNode;
        if (isDimming && !activeNodeIds.has(node.id)) return 0.18;
        return 1;
      });

    // Edges
    linkSel
      .attr("stroke-opacity", (d) => {
        if (isDimming) {
          const srcId =
            typeof d.source === "string" ? d.source : (d.source as SimNode).id;
          const dstId =
            typeof d.target === "string" ? d.target : (d.target as SimNode).id;
          return activeNodeIds.has(srcId) && activeNodeIds.has(dstId) ? 0.6 : 0.06;
        }
        return 0.3;
      })
      .attr("stroke", COLOR_EDGE);

    // Labels
    labelSel.attr("fill", (d) => {
      const node = d as SimNode;
      if (node.id === selectedPath || node.id === hovered) return COLOR_LABEL;
      return showLabels ? "#8b95a5" : "transparent";
    });
  }, [filteredGraph, selectedPath, hovered, edgeMode, showLabels]);

  if (mergedGraph === null)
    return (
      <div style={{ padding: 16, color: "#8b95a5", fontSize: 12 }}>Loading graph…</div>
    );
  if (mergedGraph.nodes.length === 0)
    return (
      <div style={{ padding: 16, color: "#8b95a5", fontSize: 12 }}>
        No notes in this workspace
      </div>
    );

  const totalNodes = mergedGraph.nodes.length;
  const totalEdges = mergedGraph.edges.length;
  const shownNodes = filteredGraph?.nodes.length ?? 0;
  const shownEdges = (() => {
    if (filteredGraph === null) return 0;
    const nodeIds = new Set(filteredGraph.nodes.map((n) => n.id));
    let count = 0;
    for (const e of filteredGraph.edges) {
      if (!nodeIds.has(e.src)) continue;
      if (resolveTargetId(e.dst, nodeIds) !== null) count += 1;
    }
    return count;
  })();

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 0 }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 10px",
          alignItems: "center",
          flexWrap: "wrap",
          borderBottom: "1px solid #1e232b",
          background: "#0d0f13",
        }}
      >
        <select
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value)}
          title="Filter by feature"
          style={{
            background: "#181b20",
            color: "#c9d1de",
            border: "1px solid #2a303c",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 11,
          }}
        >
          <option value="all">All features</option>
          {features.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          value={edgeMode}
          onChange={(e) => setEdgeMode(e.target.value as "all" | "neighbors")}
          title="Edge density"
          style={{
            background: "#181b20",
            color: "#c9d1de",
            border: "1px solid #2a303c",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 11,
          }}
        >
          <option value="all">All edges</option>
          <option value="neighbors">Neighbors of selected</option>
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#8b95a5",
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            style={{ accentColor: "#7c86ff" }}
          />
          labels
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#8b95a5",
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <input
            type="checkbox"
            checked={showWorklogs}
            onChange={(e) => setShowWorklogs(e.target.checked)}
            style={{ accentColor: "#7c86ff" }}
          />
          worklogs
        </label>

        <button
          onClick={() => {
            const sim = simRef.current;
            if (sim !== null) {
              sim.alpha(0.35).restart();
              setTimeout(() => sim.alphaTarget(0), 600);
            }
          }}
          style={{
            marginLeft: 6,
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #2a303c",
            background: "#181b20",
            color: "#8b95a5",
            cursor: "pointer",
          }}
        >
          reheat
        </button>

        <button
          onClick={() => setShowTuning((v) => !v)}
          title="Tune attraction & distance"
          style={{
            marginLeft: 4,
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 8,
            border: showTuning ? "1px solid #7c86ff" : "1px solid #2a303c",
            background: showTuning ? "#1e232b" : "#181b20",
            color: showTuning ? "#c9d1de" : "#8b95a5",
            cursor: "pointer",
          }}
        >
          {showTuning ? "✕ tuning" : "⚙ tuning"}
        </button>

        <span style={{ marginLeft: "auto", fontSize: 11, color: "#5a6577" }}>
          {shownNodes}/{totalNodes} nodes · {shownEdges}/{totalEdges} edges
        </span>
      </div>
      {showTuning && (
        <div
          style={{
            background: "#181b20",
            borderBottom: "1px solid #2a303c",
            padding: "10px 12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "#8b95a5",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Cluster pull — attraction</span>
              <span style={{ color: "#c9d1de" }}>{tuning.cluster.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0.02}
              max={0.32}
              step={0.01}
              value={tuning.cluster}
              onChange={(e) =>
                setTuning((p) => ({ ...p, cluster: Number.parseFloat(e.target.value) }))
              }
              style={{ accentColor: "#7c86ff" }}
            />
            <span style={{ fontSize: 10, color: "#5a6577" }}>
              Groups pull together · low = loose, high = tight clusters
            </span>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "#8b95a5",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Link distance</span>
              <span style={{ color: "#c9d1de" }}>{tuning.linkDistance}px</span>
            </span>
            <input
              type="range"
              min={18}
              max={96}
              step={2}
              value={tuning.linkDistance}
              onChange={(e) =>
                setTuning((p) => ({
                  ...p,
                  linkDistance: Number.parseInt(e.target.value, 10),
                }))
              }
              style={{ accentColor: "#7c86ff" }}
            />
            <span style={{ fontSize: 10, color: "#5a6577" }}>
              Intra-group edge length · inter-group ×2.35
            </span>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "#8b95a5",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Attraction strength</span>
              <span style={{ color: "#c9d1de" }}>{tuning.linkStrength.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0.25}
              max={1.0}
              step={0.05}
              value={tuning.linkStrength}
              onChange={(e) =>
                setTuning((p) => ({
                  ...p,
                  linkStrength: Number.parseFloat(e.target.value),
                }))
              }
              style={{ accentColor: "#7c86ff" }}
            />
            <span style={{ fontSize: 10, color: "#5a6577" }}>
              How strongly linked notes pull · inter-group is 12% of this
            </span>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "#8b95a5",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Repulsion — node spacing</span>
              <span style={{ color: "#c9d1de" }}>{tuning.repulsion}</span>
            </span>
            <input
              type="range"
              min={-200}
              max={-24}
              step={4}
              value={tuning.repulsion}
              onChange={(e) =>
                setTuning((p) => ({
                  ...p,
                  repulsion: Number.parseInt(e.target.value, 10),
                }))
              }
              style={{ accentColor: "#7c86ff" }}
            />
            <span style={{ fontSize: 10, color: "#5a6577" }}>
              Negative = pushes nodes apart · also affects spread
            </span>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: "#8b95a5",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Collision padding</span>
              <span style={{ color: "#c9d1de" }}>{tuning.collidePadding}px</span>
            </span>
            <input
              type="range"
              min={6}
              max={22}
              step={1}
              value={tuning.collidePadding}
              onChange={(e) =>
                setTuning((p) => ({
                  ...p,
                  collidePadding: Number.parseInt(e.target.value, 10),
                }))
              }
              style={{ accentColor: "#7c86ff" }}
            />
            <span style={{ fontSize: 10, color: "#5a6577" }}>
              Minimum gap around each node
            </span>
          </label>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              gridColumn: "1 / -1",
              marginTop: 2,
            }}
          >
            <button
              onClick={() =>
                setTuning({
                  cluster: 0.14,
                  linkDistance: 34,
                  linkStrength: 0.85,
                  repulsion: -72,
                  collidePadding: 10,
                })
              }
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid #2a303c",
                background: "#0f1115",
                color: "#8b95a5",
                cursor: "pointer",
              }}
            >
              Reset defaults
            </button>
            <span style={{ fontSize: 11, color: "#5a6577" }}>
              Persisted in localStorage — survives reload
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          position: "relative",
          background: "#0d0f13",
          borderRadius: 0,
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <svg
          ref={svgRef}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 560,
            flex: 1,
            display: "block",
            cursor: "grab",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            display: "flex",
            gap: 6,
            fontSize: 10,
            color: "#5a6577",
            background: "#181b20",
            border: "1px solid #2a303c",
            borderRadius: 999,
            padding: "4px 8px",
            pointerEvents: "none",
            maxWidth: "70%",
            flexWrap: "wrap",
          }}
        >
          {features.slice(0, 8).map((f) => (
            <span key={f} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: groupColor.get(f) ?? COLOR_LOOSE,
                  display: "inline-block",
                }}
              />
              {f}
            </span>
          ))}
          <span style={{ color: "#5a6577" }}>· drag · scroll zoom · click to open</span>
        </div>
      </div>

      {selectedPath !== null && (
        <div
          style={{
            padding: "6px 10px",
            fontSize: 11,
            color: "#8b95a5",
            borderTop: "1px solid #1e232b",
            background: "#0d0f13",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ color: "#7c86ff" }}>●</span> {selectedPath}
        </div>
      )}
    </div>
  );
}
