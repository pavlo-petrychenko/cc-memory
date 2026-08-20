import React, { useMemo } from "react";
import type { Graph } from "../types";

export function GraphView({ graph, focus, onSelect, full, setFull, depth, setDepth, typeFilter, tagFilter, featureFilter, setTypeFilter, setTagFilter, setFeatureFilter }: {
  graph: Graph | null;
  focus: string | null;
  onSelect:(id:string)=>void;
  full:boolean; setFull:(v:boolean)=>void;
  depth:number; setDepth:(n:number)=>void;
  typeFilter?: string; tagFilter?: string; featureFilter?: string;
  setTypeFilter?: (v:string)=>void; setTagFilter?: (v:string)=>void; setFeatureFilter?: (v:string)=>void;
}) {
  const raw = graph ?? { nodes:[], edges:[] };
  const nodesFiltered = raw.nodes.filter((n:any)=>{
    if (typeFilter && n.type !== typeFilter) return false;
    if (tagFilter && !(n.tags ?? "").split(/\s+/).includes(tagFilter)) return false;
    if (featureFilter && (n.id.split("/")[0] ?? "") !== featureFilter) return false;
    return true;
  });
  const visibleIds = new Set(nodesFiltered.map((n:any)=>n.id));
  const edgesFiltered = raw.edges.filter((e:any)=> visibleIds.has(e.source) && visibleIds.has(e.target));
  const nodes = nodesFiltered;
  const edges = edgesFiltered;

  // simple circular layout
  const layout = useMemo(()=>{
    const w=760, h=420, cx=w/2, cy=h/2, r= Math.min(w,h)/2 - 50;
    const pos = new Map<string,{x:number;y:number}>();
    nodes.forEach((n,i)=>{
      if (n.id===focus) { pos.set(n.id,{x:cx,y:cy}); return; }
      const angle = (i / Math.max(1,nodes.length-1)) * Math.PI*2;
      pos.set(n.id, { x: cx + Math.cos(angle)*r, y: cy + Math.sin(angle)*r });
    });
    // jitter focus neighbors closer
    return { pos, w,h };
  }, [nodes, focus]);

  if (!graph) return <div style={{ padding:40, color:"var(--muted)", textAlign:"center" }}>Loading graph…</div>;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
      <div style={{ minHeight:36, display:"flex", alignItems:"center", gap:8, padding:"6px 12px", borderBottom:"1px solid var(--border)", background:"var(--panel)", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"var(--muted)", letterSpacing:".08em", textTransform:"uppercase" }}>Graph</span>
        <span style={{ fontSize:11, background:"var(--panel2)", border:"1px solid var(--border)", padding:"2px 6px", borderRadius:4 }}>{nodes.length} nodes · {edges.length} edges</span>
        <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--muted)" }}>
          Depth
          <select value={depth} onChange={e=>setDepth(Number(e.target.value))} style={{ background:"var(--panel2)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 6px", fontSize:11 }}>
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
          </select>
        </label>
        {setTypeFilter && <input value={typeFilter ?? ""} onChange={e=>setTypeFilter(e.target.value)} placeholder="type:spec" style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:"3px 6px", fontSize:11, width:90, color:"var(--text)" }} />}
        {setTagFilter && <input value={tagFilter ?? ""} onChange={e=>setTagFilter(e.target.value)} placeholder="tag:auth" style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:"3px 6px", fontSize:11, width:90, color:"var(--text)" }} />}
        {setFeatureFilter && <input value={featureFilter ?? ""} onChange={e=>setFeatureFilter(e.target.value)} placeholder="feature:auth" style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:"3px 6px", fontSize:11, width:100, color:"var(--text)" }} />}
        <button
          onClick={()=>setFull(!full)}
          style={{ marginLeft:"auto", background: full? "var(--accent)" : "var(--panel2)", color: full? "#fff":"var(--text)", border:"1px solid var(--border)", borderRadius:6, padding:"5px 10px", fontSize:11, cursor:"pointer" }}
        >
          {full ? "→ Focused" : "→ Full vault"}
        </button>
      </div>
      <div style={{ flex:1, position:"relative", background:"var(--bg)", overflow:"hidden" }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} style={{ width:"100%", height:"100%", display:"block" }}>
          {/* edges */}
          {edges.map((e,i)=>{
            const a = layout.pos.get(e.source);
            const b = layout.pos.get(e.target);
            if (!a||!b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" strokeWidth={1.2} opacity={0.9} />;
          })}
          {/* nodes */}
          {nodes.map(n=>{
            const p = layout.pos.get(n.id)!;
            const isFocus = n.id===focus;
            const isHigh = n.importance!==null && n.importance>=8;
            return (
              <g key={n.id} onClick={()=>onSelect(n.id)} style={{ cursor:"pointer" }}>
                <circle
                  cx={p.x} cy={p.y}
                  r={isFocus ? 14 : isHigh ? 10 : 7}
                  fill={isFocus ? "var(--accent)" : isHigh ? "var(--accent2)" : "var(--panel2)"}
                  stroke={isFocus ? "#fff" : "var(--accent)"}
                  strokeWidth={isFocus ? 2 : 1.2}
                  style={{ filter: isFocus ? "drop-shadow(0 0 10px var(--accent))" : undefined }}
                />
                <text x={p.x} y={p.y + (isFocus?24:18)} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="Fragment Mono" style={{ pointerEvents:"none" }}>
                  {n.title.slice(0,18)}
                </text>
              </g>
            );
          })}
        </svg>
        {/* legend */}
        <div style={{ position:"absolute", bottom:10, left:10, background:"var(--panel)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", fontSize:11, color:"var(--muted)", display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:10, borderRadius:"50%", background:"var(--accent)", display:"inline-block" }} /> focus</span>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:10, borderRadius:"50%", background:"var(--accent2)", display:"inline-block" }} /> imp≥8</span>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:10, borderRadius:"50%", background:"var(--panel2)", border:"1px solid var(--accent)", display:"inline-block" }} /> note</span>
        </div>
      </div>
    </div>
  );
}
