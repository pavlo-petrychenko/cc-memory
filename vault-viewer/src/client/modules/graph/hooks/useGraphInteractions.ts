import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MutableRefObject } from "react";
import * as d3 from "d3";
import type { GraphNode, GraphEdge } from "../components/GraphCanvas.js";

export function useZoom(
  svgRef: RefObject<SVGSVGElement>,
  gRef: RefObject<SVGGElement>,
  enabled = true,
): void {
  useEffect(() => {
    const svgEl = svgRef.current;
    const gEl = gRef.current;
    if (!svgEl || !gEl || !enabled) return;

    const svg = d3.select(svgEl);
    const g = d3.select(gEl);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.18, 5])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });

    svg.call(zoom as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => {
      svg
        .transition()
        .duration(400)
        .call((zoom as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void).bind(null) as never, d3.zoomIdentity as never);
      // Fallback: direct if above type dance fails
      svg.call(zoom.transform as unknown as never, d3.zoomIdentity as never);
    });

    return () => {
      svg.on(".zoom", null);
      svg.on("dblclick", null);
    };
  }, [svgRef, gRef, enabled]);
}

export function useDrag(
  gRef: RefObject<SVGGElement>,
  simRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>,
  nodes: GraphNode[],
): void {
  // Use a ref to avoid rebinding on every tick
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    const gEl = gRef.current;
    const sim = simRef.current;
    if (!gEl || !sim) return;

    const sel = d3.select(gEl).selectAll<SVGGElement, GraphNode>("g.node");

    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x ?? null;
        d.fy = d.y ?? null;
      })
      .on("drag", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
        if (!event.active) sim.alphaTarget(0);
      });

    sel.call(drag as unknown as (selection: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>) => void);

    sel.on("dblclick", (_event: unknown, d: GraphNode) => {
      d.fx = null;
      d.fy = null;
      sim.alpha(0.4).restart();
    });

    return () => {
      sel.on(".drag", null);
      sel.on("dblclick", null);
    };
  }, [gRef, simRef, nodes.length]);
}
