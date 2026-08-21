import React, { Suspense, useMemo } from "react";

import type { GraphConfig } from "../hooks/useGraphPhysics.js";
import { getFeatureColorMap } from "../utils/featureColors.js";
import {
  computeClusterSeeds,
  computeWorldExtent,
  seededPosition,
} from "../utils/worldLayout.js";
import type { GraphNode, GraphEdge } from "./GraphCanvas.js";
import { GraphConfigPanel } from "./GraphConfigPanel.js";
import { GraphLegend } from "./GraphLegend.js";

const GraphCanvas = React.lazy(() => import("./GraphCanvas.js"));

const EMPTY_GRAPH: GraphDto = { nodes: [], edges: [] };

type GraphDto = {
  nodes: Array<{
    id: string;
    title: string;
    type: string;
    importance: number | null;
    tags: string[] | string;
  }>;
  edges: Array<{ source: string; target: string; relationType: string }>;
};

type Props = {
  graph: GraphDto | null;
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
  config: GraphConfig;
  setConfig: React.Dispatch<React.SetStateAction<GraphConfig>>;
  onResetConfig: () => void;
};

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
  config,
  setConfig,
  onResetConfig,
}: Props): React.JSX.Element {
  const raw = graph ?? EMPTY_GRAPH;

  const { nodesFiltered, edgesFiltered, featureColor, featureList } = useMemo(() => {
    const nodes = raw.nodes.filter((n) => {
      if (typeFilter && n.type !== typeFilter) return false;
      if (tagFilter) {
        const tagList: string[] = Array.isArray(n.tags)
          ? n.tags
          : (n.tags ?? "").split(/\s+/).filter(Boolean);
        if (!tagList.includes(tagFilter)) return false;
      }
      const feat = (n.id.split("/")[0] ?? "").toLowerCase();
      if (featureFilter && feat !== featureFilter.toLowerCase()) return false;
      return true;
    });
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = raw.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );

    const { map, list } = getFeatureColorMap(nodes.map((n) => n.id));
    return {
      nodesFiltered: nodes,
      edgesFiltered: edges,
      featureColor: map,
      featureList: list,
    };
  }, [raw.nodes, raw.edges, typeFilter, tagFilter, featureFilter]);

  // Build sim nodes/edges with degree, feature, color, focus
  const { simNodes, simEdges } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of edgesFiltered) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const extent = computeWorldExtent(nodesFiltered.length);
    const seeds = computeClusterSeeds(featureList, extent);

    const nodes: GraphNode[] = nodesFiltered.map((n) => {
      const feature = n.id.includes("/") ? (n.id.split("/")[0] ?? "") : "";
      const color = featureColor.get(feature) ?? "#7A7A85";
      const isFocus = n.id === focus;
      const deg = degree.get(n.id) ?? 0;
      // deterministic per-id seed: re-layouts stay stable across focus changes
      const pos = seededPosition(
        n.id,
        seeds.xOf(feature),
        seeds.yOf(feature),
        extent * 0.07,
      );
      return {
        id: n.id,
        title: n.title,
        type: n.type,
        importance: n.importance,
        tags: Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags ?? ""),
        feature,
        color,
        degree: deg,
        isFocus,
        x: isFocus ? extent / 2 : pos.x,
        y: isFocus ? extent / 2 : pos.y,
      };
    });

    const edges: GraphEdge[] = edgesFiltered.map((e) => {
      const sFeat = e.source.includes("/") ? (e.source.split("/")[0] ?? "") : "";
      const tFeat = e.target.includes("/") ? (e.target.split("/")[0] ?? "") : "";
      return {
        source: e.source,
        target: e.target,
        relationType: e.relationType,
        sameFeature: sFeat !== "" && sFeat === tFeat,
      };
    });

    return { simNodes: nodes, simEdges: edges };
  }, [nodesFiltered, edgesFiltered, featureColor, featureList, focus]);

  const [showSettings, setShowSettings] = React.useState(false);

  if (!graph) {
    return (
      <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}>
        Loading graph…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
        <span
          style={{
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: "var(--accent)",
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          Graph
        </span>
        <span
          style={{
            fontSize: 11,
            background: "var(--panel2)",
            border: "1px solid var(--border)",
            padding: "2px 6px",
            borderRadius: 4,
            color: "var(--muted)",
          }}
        >
          {simNodes.length} nodes · {simEdges.length} edges
        </span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          Depth
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            style={{
              background: "var(--panel2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
          </select>
        </label>
        {setTypeFilter ? (
          <input
            value={typeFilter ?? ""}
            onChange={(e) => setTypeFilter(e.target.value)}
            placeholder="type:spec"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 6px",
              fontSize: 11,
              width: 90,
              color: "var(--text)",
              fontFamily: "Fragment Mono",
            }}
          />
        ) : null}
        {setTagFilter ? (
          <input
            value={tagFilter ?? ""}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="tag:auth"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 6px",
              fontSize: 11,
              width: 90,
              color: "var(--text)",
              fontFamily: "Fragment Mono",
            }}
          />
        ) : null}
        {setFeatureFilter ? (
          <input
            value={featureFilter ?? ""}
            onChange={(e) => setFeatureFilter(e.target.value)}
            placeholder="feature:auth"
            list="graph-features"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 6px",
              fontSize: 11,
              width: 110,
              color: "var(--text)",
              fontFamily: "Fragment Mono",
            }}
          />
        ) : null}
        <datalist id="graph-features">
          {featureList.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <button
          type="button"
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
          type="button"
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

      {showSettings ? (
        <GraphConfigPanel config={config} setConfig={setConfig} onReset={onResetConfig} />
      ) : null}

      <div
        style={{
          flex: 1,
          position: "relative",
          background: "var(--bg)",
          overflow: "hidden",
        }}
      >
        <Suspense
          fallback={
            <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}>
              Loading canvas…
            </div>
          }
        >
          <GraphCanvas
            nodes={simNodes}
            edges={simEdges}
            config={config}
            featureList={featureList}
            focus={focus}
            onSelect={onSelect}
          />
        </Suspense>
        <GraphLegend featureList={featureList} featureColor={featureColor} />
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 10,
            color: "var(--muted)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
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
