import React, { useState } from "react";
import type { TreeNode, WorklogSlug } from "../types";

function Row({ node, depth, active, onOpen, expanded, onToggle }: { node: TreeNode; depth:number; active:string; onOpen:(p:string)=>void; expanded:Set<string>; onToggle:(p:string)=>void }) {
  const isDir = node.type==="dir";
  const isExpanded = expanded.has(node.path);
  const isActive = node.path===active && node.type==="file";
  return (
    <>
      <div
        onClick={()=> isDir ? onToggle(node.path) : onOpen(node.path)}
        style={{
          display:"flex", alignItems:"center", gap:6,
          padding:"4px 8px", marginLeft: depth*10,
          borderRadius:4, cursor:"pointer", fontSize:12,
          background: isActive ? "var(--accent)" : "transparent",
          color: isActive ? "#fff" : "var(--muted)",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        }}
      >
        <span style={{ fontSize:10, width:10 }}>{isDir ? (isExpanded ? "▾" : "▸") : "≡"}</span>
        <span style={{ opacity:.7, fontSize:11 }}>{isDir ? "📁" : node.isIndex ? "★" : "≡"}</span>
        <span style={{ fontWeight: node.isIndex ? 600 : 400, color: isActive ? "#fff" : "var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{node.name || "/"}</span>
      </div>
      {isDir && isExpanded && node.children?.map(c=>(
        <Row key={c.path} node={c} depth={depth+1} active={active} onOpen={onOpen} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

export function Explorer({ kbTree, worklogs, active, onOpen, onWorklogSlug }: { kbTree: TreeNode | null; worklogs: WorklogSlug[]; active:string; onOpen:(p:string)=>void; onWorklogSlug:(slug:string)=>void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["", "auth", "_root", "search"]));
  const toggle = (p:string)=> setExpanded(prev=>{
    const n = new Set(prev);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });

  return (
    <div style={{ padding:"8px 6px", overflow:"auto", flex:1 }}>
      <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", padding:"6px 8px", display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ width:6, height:6, background:"var(--accent)", borderRadius:2, display:"inline-block" }} /> KB
        <span style={{ flex:1, height:1, background:"var(--border)" }} />
      </div>
      {kbTree?.children?.length ? kbTree.children.map(c=>(
        <Row key={c.path} node={c} depth={0} active={active} onOpen={onOpen} expanded={expanded} onToggle={toggle} />
      )) : <div style={{ padding:"8px", color:"var(--muted)", fontSize:12 }}>No notes</div>}

      <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", padding:"14px 8px 6px", display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ width:6, height:6, background:"var(--accent2)", borderRadius:2, display:"inline-block" }} /> WORKLOGS
        <span style={{ flex:1, height:1, background:"var(--border)" }} />
      </div>
      {worklogs.length===0 && <div style={{ padding:"8px", color:"var(--muted)", fontSize:12 }}>No worklogs</div>}
      {worklogs.map(s=>(
        <div key={s.slug}>
          <div
            onClick={()=> {
              if (s.stateExists) onOpen(`${s.slug}/STATE.md`);
              else onWorklogSlug(s.slug);
            }}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:4, cursor:"pointer", fontSize:12, color:"var(--muted)" }}
          >
            <span style={{ fontSize:10 }}>{expanded.has(`wl:${s.slug}`) ? "▾" : "▸"}</span>
            <span style={{ cursor:"pointer" }} onClick={(e)=>{e.stopPropagation(); const n=new Set(expanded); if(n.has(`wl:${s.slug}`)) n.delete(`wl:${s.slug}`); else n.add(`wl:${s.slug}`); setExpanded(n);}}>📁</span>
            <span style={{ color:"var(--text)" }}>{s.slug}</span>
            <span style={{ marginLeft:"auto", fontSize:10, background:"var(--panel2)", border:"1px solid var(--border)", padding:"1px 4px", borderRadius:10 }}>{s.entries.length + (s.stateExists?1:0)}</span>
          </div>
          {expanded.has(`wl:${s.slug}`) !== false && (
            <div style={{ marginLeft:10 }}>
              {s.stateExists && (
                <div onClick={()=>onOpen(`${s.slug}/STATE.md`)} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:4, cursor:"pointer", fontSize:12, background: active===`${s.slug}/STATE.md` ? "var(--accent)" : "transparent", color: active===`${s.slug}/STATE.md` ? "#fff" : "var(--muted)" }}>
                  <span style={{ opacity:.7 }}>◆</span> STATE.md
                </div>
              )}
              {s.entries.map(e=>(
                <div key={e.relPath} onClick={()=>onOpen(e.relPath)} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:4, cursor:"pointer", fontSize:12, background: active===e.relPath ? "var(--accent)" : "transparent", color: active===e.relPath ? "#fff" : "var(--muted)" }}>
                  <span style={{ opacity:.7 }}>≡</span> {e.date}.md
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
