import * as d3 from "d3";
import React, { useEffect, useMemo, useRef } from "react";

import { computeWorldExtent } from "../utils/worldLayout.js";

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

// Mutable render/simulation state kept out of React — zero re-renders per tick.
type CanvasState = {
  nodes: GraphNode[];
  size: { w: number; h: number; dpr: number };
  transform: d3.ZoomTransform;
  dirty: boolean;
  physicsActive: boolean;
  framePending: boolean;
  userInteracted: boolean;
  needsFit: boolean;
  quadtree: d3.Quadtree<GraphNode> | null;
  hoverId: string | null;
  hubIds: Set<string>;
  neighbors: Map<string, Set<string>>;
  dragNodeId: string | null;
  dragMoved: boolean;
  pointerDown: { x: number; y: number } | null;
  nodeHit: boolean;
};

const ALPHA_MIN = 0.001;
const NODE_HIT_MIN = 8;
const NODE_HIT_MAX = 28;
// Labels: hubs stay labeled at any zoom; hovering a node reveals its own
// plus its neighbors' labels; deliberate zoom-in reveals everything.
const LABEL_ALL_K = 1.5;
// Fraction of nodes ranked as hubs (highest degree) that keep permanent labels.
const HUB_LABEL_FRACTION = 0.12;
const HUB_LABEL_MIN = 8;
const HUB_LABEL_MAX = 24;

function nodeRadius(n: GraphNode): number {
  if (n.isFocus) return 13;
  return n.importance !== null && n.importance >= 8 ? 10 : 7.5;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(163,255,181,${alpha})`;
  const int = parseInt(m[1]!, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

export default function GraphCanvas({
  nodes,
  edges,
  config,
  featureList,
  onSelect,
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const minScaleRef = useRef(0.05);
  const rafRef = useRef<number>(0);

  // Mutable render/simulation state kept out of React — zero re-renders per tick.
  const stRef = useRef<CanvasState>({
    nodes: [],
    size: { w: 0, h: 0, dpr: 1 },
    transform: d3.zoomIdentity,
    dirty: true,
    physicsActive: false,
    framePending: false,
    userInteracted: false,
    needsFit: false,
    quadtree: null,
    hoverId: null,
    hubIds: new Set<string>(),
    neighbors: new Map<string, Set<string>>(),
    dragNodeId: null,
    dragMoved: false,
    pointerDown: null,
    nodeHit: false,
  });

  // Clone so d3-force can mutate freely without touching props.
  const simNodes = useMemo<GraphNode[]>(() => nodes.map((n) => ({ ...n })), [nodes]);
  const simEdges = useMemo<GraphEdge[]>(() => edges.map((e) => ({ ...e })), [edges]);

  useEffect(() => {
    const container = containerRef.current;
    const canvasEl = canvasRef.current;
    if (!container || !canvasEl) return;
    // non-null aliases: TS widening does not survive into hoisted closures
    const canvas: HTMLCanvasElement = canvasEl;
    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;
    const st = stRef.current;
    st.nodes = simNodes;
    st.userInteracted = false;
    st.needsFit = true;
    st.quadtree = null;

    const extent = computeWorldExtent(simNodes.length);
    const cx = extent / 2;
    const cy = extent / 2;

    // --- cluster anchors ---------------------------------------------------
    const clusterX = new Map<string, number>();
    const clusterY = new Map<string, number>();
    const clusterCount = Math.max(1, featureList.length);
    featureList.forEach((f, i) => {
      const angle = (i / clusterCount) * Math.PI * 2 - Math.PI / 2;
      const r = extent * 0.3;
      clusterX.set(f, cx + Math.cos(angle) * r);
      clusterY.set(f, cy + Math.sin(angle) * r);
    });
    clusterX.set("", cx);
    clusterY.set("", cy);

    // --- label tiers ---------------------------------------------------------
    // Hub nodes keep their labels at every zoom level; everything else labels
    // only on hover (self + neighbors) or past LABEL_ALL_K.
    const hubCount = Math.min(
      HUB_LABEL_MAX,
      Math.max(HUB_LABEL_MIN, Math.round(simNodes.length * HUB_LABEL_FRACTION)),
    );
    const hubIds = new Set(
      simNodes
        .toSorted((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
        .slice(0, hubCount)
        .map((n) => n.id),
    );
    stRef.current.hubIds = hubIds;

    const neighborIds = new Map<string, Set<string>>();
    for (const e of edges) {
      // SAFETY: these are the immutable prop edges — forceLink only rewrites
      // the simEdges clones handed to it, so endpoints here stay id strings.
      const { source: sourceId, target: targetId } = e as {
        source: string;
        target: string;
      };
      let a = neighborIds.get(sourceId);
      if (!a) neighborIds.set(sourceId, (a = new Set()));
      let b = neighborIds.get(targetId);
      if (!b) neighborIds.set(targetId, (b = new Set()));
      a.add(targetId);
      b.add(sourceId);
    }
    stRef.current.neighbors = neighborIds;

    if (simNodes.length === 0) {
      st.physicsActive = false;
      st.dirty = true;
      scheduleFrame();
      return;
    }

    // --- simulation ----------------------------------------------------------
    const sim = d3
      .forceSimulation<GraphNode, GraphEdge>(simNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(simEdges)
          .id((d) => d.id)
          .distance((d) =>
            d.sameFeature ? config.linkDistance * 0.62 : config.linkDistance,
          )
          .strength((d) =>
            d.sameFeature
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
          .radius((d) => nodeRadius(d) + config.collideRadius)
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
      .alphaDecay(Math.max(0.02, 0.028 - Math.min(0.008, simNodes.length / 40000)))
      .velocityDecay(0.32)
      .stop();

    simRef.current = sim;
    st.physicsActive = true;

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

    // --- frame loop: tick physics while active, draw only when dirty --------
    function frame(): void {
      const s = stRef.current;
      s.framePending = false;
      const activeSim = simRef.current;
      if (s.physicsActive && activeSim) {
        activeSim.tick();
        s.quadtree = null;
        s.dirty = true;
        if (activeSim.alpha() < ALPHA_MIN && activeSim.alphaTarget() === 0) {
          s.physicsActive = false;
          if (s.needsFit && !s.userInteracted && fitView(true)) {
            s.needsFit = false;
          }
        }
      }
      if (s.dirty) {
        s.dirty = false;
        draw();
      }
      if (s.physicsActive) scheduleFrame();
    }

    function scheduleFrame(): void {
      if (stRef.current.framePending) return;
      stRef.current.framePending = true;
      rafRef.current = requestAnimationFrame(frame);
    }

    function wakePhysics(target: number): void {
      const activeSim = simRef.current;
      if (!activeSim) return;
      activeSim.alphaTarget(target);
      stRef.current.physicsActive = true;
      scheduleFrame();
    }

    // --- drawing ---------------------------------------------------------------
    function draw(): void {
      const s = stRef.current;
      const { w, h, dpr } = s.size;
      if (w === 0 || h === 0) return;
      const t = s.transform;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // visible world rect (+margin) for culling
      const vx0 = -t.x / t.k - 60;
      const vy0 = -t.y / t.k - 60;
      const vx1 = (w - t.x) / t.k + 60;
      const vy1 = (h - t.y) / t.k + 60;

      // edges batched into one Path2D per style
      const crossPath = new Path2D();
      const samePaths = new Map<string, Path2D>();
      for (const e of simEdges) {
        // SAFETY: forceLink replaced the id strings with node references when
        // the simulation was initialized; every tick keeps them objects.
        const { source: a, target: b } = e as {
          source: GraphNode;
          target: GraphNode;
        };
        if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
        const aIn = a.x >= vx0 && a.x <= vx1 && a.y >= vy0 && a.y <= vy1;
        const bIn = b.x >= vx0 && b.x <= vx1 && b.y >= vy0 && b.y <= vy1;
        if (!aIn && !bIn) continue;
        if (e.sameFeature) {
          const key = a.color;
          let p = samePaths.get(key);
          if (!p) {
            p = new Path2D();
            samePaths.set(key, p);
          }
          p.moveTo(a.x, a.y);
          p.lineTo(b.x, b.y);
        } else {
          crossPath.moveTo(a.x, a.y);
          crossPath.lineTo(b.x, b.y);
        }
      }
      ctx.lineWidth = 1 / t.k;
      ctx.strokeStyle = "rgba(128,128,140,0.32)";
      ctx.stroke(crossPath);
      ctx.lineWidth = 1.6 / t.k;
      for (const [color, path] of samePaths) {
        ctx.strokeStyle = hexToRgba(color, 0.6);
        ctx.stroke(path);
      }

      for (const n of s.nodes) {
        if (n.x == null || n.y == null) continue;
        if (n.x < vx0 || n.x > vx1 || n.y < vy0 || n.y > vy1) continue;
        const r = nodeRadius(n);

        if (n.isFocus) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(163,255,181,0.4)";
          ctx.lineWidth = 1.2 / t.k;
          ctx.stroke();
          ctx.shadowColor = "rgba(163,255,181,0.8)";
          ctx.shadowBlur = 10;
        }
        if (s.hoverId === n.id) {
          // ring the hovered node so the revealed neighborhood reads clearly
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(163,255,181,0.9)";
          ctx.lineWidth = 1.6 / t.k;
          ctx.stroke();
        }
        if (n.fx != null && n.fy != null) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = "rgba(230,180,80,0.8)";
          ctx.lineWidth = 1.2 / t.k;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        const highImportance = n.importance !== null && n.importance >= 8;
        let strokeW = 1;
        if (n.isFocus) strokeW = 2.2;
        else if (highImportance) strokeW = 1.4;
        ctx.lineWidth = strokeW / t.k;
        ctx.strokeStyle = n.isFocus || highImportance ? "#ffffff" : "rgba(20,20,26,0.9)";
        ctx.stroke();
        if (n.isFocus) ctx.shadowBlur = 0;

        if (n.degree > 3) {
          ctx.beginPath();
          ctx.arc(n.x + r * 0.7, n.y - r * 0.7, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "#14141a";
          ctx.fill();
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1 / t.k;
          ctx.stroke();
        }
      }

      // labels last so they stay readable over edges/nodes
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const px = Math.round((11 / t.k) * 2) / 2;
      const hoverNeighbors =
        s.hoverId != null ? (s.neighbors.get(s.hoverId) ?? null) : null;
      for (const n of s.nodes) {
        if (n.x == null || n.y == null) continue;
        if (n.x < vx0 || n.x > vx1 || n.y < vy0 || n.y > vy1) continue;
        let labeled: boolean;
        if (n.isFocus || s.hubIds.has(n.id)) labeled = true;
        else if (t.k >= LABEL_ALL_K) labeled = true;
        else if (s.hoverId != null)
          labeled = n.id === s.hoverId || (hoverNeighbors?.has(n.id) ?? false);
        else labeled = false;
        if (!labeled) continue;
        const r = nodeRadius(n);
        const isHoverContext =
          s.hoverId != null &&
          (n.id === s.hoverId || (hoverNeighbors?.has(n.id) ?? false));
        ctx.font = `${n.isFocus || isHoverContext ? "600 " : ""}${px}px "Fragment Mono", ui-monospace, monospace`;
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = "rgba(16,16,22,0.85)";
        ctx.strokeText(n.title.slice(0, 24), n.x, n.y + r + 4);
        ctx.fillStyle = isHoverContext ? "#f2f2f5" : "rgba(190,190,200,0.92)";
        ctx.fillText(n.title.slice(0, 24), n.x, n.y + r + 4);
      }
    }

    // --- fit-to-view -------------------------------------------------------------
    function fitView(animated: boolean): boolean {
      const s = stRef.current;
      const { w, h } = s.size;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of s.nodes) {
        if (n.x == null || n.y == null) continue;
        // margin covers node radius plus roughly half a truncated label
        const r = nodeRadius(n) + 30;
        if (n.x - r < x0) x0 = n.x - r;
        if (n.y - r < y0) y0 = n.y - r;
        if (n.x + r > x1) x1 = n.x + r;
        if (n.y + r > y1) y1 = n.y + r;
      }
      if (x0 === Infinity || w === 0 || h === 0) return false;
      const bw = Math.max(1, x1 - x0);
      const bh = Math.max(1, y1 - y0);
      const rawK = Math.min(w / bw, h / bh);
      const k = Math.max(minScaleRef.current, Math.min(1.4, rawK));
      // compose so bbox center lands on viewport center AT scale k:
      // translate to center, scale, then shift by the scaled bbox center.
      const bcx = (x0 + x1) / 2;
      const bcy = (y0 + y1) / 2;
      const t = d3.zoomIdentity
        .translate(w / 2, h / 2)
        .scale(k)
        .translate(-bcx, -bcy);
      const sel = d3.select(canvas);
      const z = zoomRef.current!;
      if (animated) {
        sel.transition().duration(450).ease(d3.easeCubicOut).call(z.transform, t);
      } else {
        sel.call(z.transform, t);
      }
      return true;
    }

    // --- zoom & pan -----------------------------------------------------------------
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.02, 8])
      .filter((event) => {
        // never start panning when the gesture begins on a node
        if (
          stRef.current.nodeHit &&
          (event.type === "mousedown" ||
            event.type === "pointerdown" ||
            event.type === "touchstart")
        ) {
          return false;
        }
        return !event.ctrlKey || event.type === "wheel";
      })
      .on("zoom", (event) => {
        stRef.current.transform = event.transform;
        stRef.current.dirty = true;
        scheduleFrame();
      });
    zoomRef.current = zoom;
    d3.select(canvas).call(zoom).on("dblclick.zoom", null);

    // --- pointer interactions (select / drag-pin / hover) ----------------------------
    function toWorld(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const t = stRef.current.transform;
      return {
        x: (clientX - rect.left - t.x) / t.k,
        y: (clientY - rect.top - t.y) / t.k,
      };
    }

    function hitTest(wx: number, wy: number): GraphNode | null {
      const s = stRef.current;
      if (s.nodes.length === 0) return null;
      if (!s.quadtree) {
        // SAFETY: d3-force assigns an (x, y) to every node during simulation init,
        // so accessors can never observe undefined here.
        s.quadtree = d3.quadtree<GraphNode>(
          s.nodes,
          (n) => n.x!,
          (n) => n.y!,
        );
      }
      const t = s.transform;
      const r = Math.min(NODE_HIT_MAX, Math.max(NODE_HIT_MIN, NODE_HIT_MIN / t.k));
      return s.quadtree.find(wx, wy, r) ?? null;
    }

    function onPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return;
      const p = toWorld(event.clientX, event.clientY);
      const hit = hitTest(p.x, p.y);
      const s = stRef.current;
      s.nodeHit = hit !== null;
      s.pointerDown = { x: event.clientX, y: event.clientY };
      s.dragMoved = false;
      s.dragNodeId = hit?.id ?? null;
      if (hit) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        event.stopImmediatePropagation(); // keep d3.zoom from treating this as pan
      }
    }

    function onPointerMove(event: PointerEvent): void {
      const s = stRef.current;
      const down = s.pointerDown;
      if (!down) {
        const p = toWorld(event.clientX, event.clientY);
        const hit = hitTest(p.x, p.y);
        const id = hit?.id ?? null;
        if (id !== s.hoverId) {
          s.hoverId = id;
          canvas.style.cursor = hit ? "pointer" : "grab";
          // hover drives label visibility, so repaint
          s.dirty = true;
          scheduleFrame();
        }
        return;
      }
      const node = s.dragNodeId ? s.nodes.find((n) => n.id === s.dragNodeId) : undefined;
      if (!node) return;
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if (!s.dragMoved) {
        if (dx * dx + dy * dy < 16) return;
        s.dragMoved = true;
        s.userInteracted = true;
        node.fx = node.x ?? null;
        node.fy = node.y ?? null;
        wakePhysics(0.3);
        canvas.style.cursor = "grabbing";
      }
      const p = toWorld(event.clientX, event.clientY);
      node.fx = p.x;
      node.fy = p.y;
      s.quadtree = null;
      s.dirty = true;
    }

    function onPointerUp(event: PointerEvent): void {
      const s = stRef.current;
      const wasDrag = s.dragMoved;
      const nodeId = s.dragNodeId;
      s.pointerDown = null;
      s.dragNodeId = null;
      s.nodeHit = false;
      if (wasDrag) {
        simRef.current?.alphaTarget(0);
        canvas.style.cursor = "grab";
      } else if (nodeId) {
        onSelectRef.current(nodeId);
      }
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    function onDblClick(event: MouseEvent): void {
      const p = toWorld(event.clientX, event.clientY);
      const hit = hitTest(p.x, p.y);
      if (hit) {
        hit.fx = null;
        hit.fy = null;
        stRef.current.quadtree = null;
        simRef.current?.alpha(0.4);
        wakePhysics(0);
      } else {
        fitView(true);
      }
    }

    // capture phase so node hits are registered before d3.zoom sees the gesture
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("dblclick", onDblClick);

    // --- resize ------------------------------------------------------------------------
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      stRef.current.size = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      stRef.current.dirty = true;
      scheduleFrame();
    });
    ro.observe(container);

    // how far out fitting can land grows with graph size
    minScaleRef.current = Math.min(
      0.08,
      Math.max(0.03, 0.35 / Math.sqrt(Math.max(1, simNodes.length / 40))),
    );

    scheduleFrame();

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", onDblClick);
      d3.select(canvas).on(".zoom", null);
      d3.select(canvas).interrupt();
      cancelAnimationFrame(rafRef.current);
      sim.stop();
      simRef.current = null;
      stRef.current.framePending = false;
      stRef.current.physicsActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simNodes, simEdges, config, featureList]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "grab",
          touchAction: "none",
        }}
      />
    </div>
  );
}
