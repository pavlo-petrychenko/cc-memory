import { useEffect, useState, useMemo, useCallback } from "react";
import { api, type Workspace, type TreeNode, type SearchHit, type GraphResp, type NoteResp } from "./services/api";
import { useLocalTabs } from "./hooks/useLocalTabs";

// --- markdown render ---
function renderMarkdown(note: NoteResp, workspaceId: string, onLink: (target: string, newTab: boolean) => void): string {
  let md = note.body;
  // embed ![[xxx]]
  md = md.replace(/!\[\[([^\]]+)\]\]/g, (_m, p1) => {
    const tgt = String(p1).split("|")[0]!.trim();
    return `<div class="embed"><small style="color:var(--muted);font:11px JetBrains Mono,monospace">embed → ${tgt}</small><div style="margin-top:6px;opacity:.8">Embedded: ${tgt} (open to view)</div></div>`;
  });
  // mermaid
  md = md.replace(/```mermaid([\s\S]*?)```/g, (_m, code) => `<div class="embed" style="border-left-color:#7EB8FF"><small>mermaid</small><pre style="margin:8px 0 0;white-space:pre-wrap">${String(code).trim()}</pre></div>`);
  // images ![alt](path)
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, p) => {
    const url = api.fileUrl(workspaceId, String(p).trim());
    return `<div class="img"><div class="img-head">● ● ● ${String(p).trim()}</div><div class="img-body"><img src="${url}" alt="${String(alt)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"/><div style="display:none;padding:20px;text-align:center;color:var(--muted)">image: ${String(p).trim()}</div></div></div>`;
  });
  // wikilinks [[a|b]]
  md = md.replace(/\[\[([^\]]+)\]\]/g, (_m, inside) => {
    const parts = String(inside).split("|");
    const target = parts[0]!.trim();
    const alias = (parts[1] ?? target).trim();
    const esc = target.replace(/"/g, "&quot;");
    return `<span class="wikilink" data-target="${esc}">${alias}</span>`;
  });
  // callouts > [!NOTE]
  md = md.replace(/>\s*\[!(NOTE|WARNING|TIP|IMPORTANT)\]\s*([^\n]*)\n((?:>.*\n?)*)/gi, (_m, kind, title, body) => {
    const k = String(kind).toUpperCase();
    const b = String(body).replace(/^>\s?/gm, "").trim();
    return `<div class="callout"><div class="callout-head">ℹ ${k} — ${title || k}</div><div class="callout-body">${b}</div></div>`;
  });
  // code blocks
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => `<pre><code>${String(code).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</code></pre>`);
  // headings
  md = md.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  md = md.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  md = md.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  // bold/italic
  md = md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  md = md.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // inline code
  md = md.replace(/`([^`]+)`/g, "<code>$1</code>");
  // checkboxes
  md = md.replace(/^- \[x\]/gim, "☑");
  md = md.replace(/^- \[ \]/gim, "☐");
  // unordered lists
  md = md.replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>");
  md = md.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
  // paragraphs: split by double newline
  md = md.split(/\n{2,}/).map((blk) => {
    const t = blk.trim();
    if (!t) return "";
    if (t.startsWith("<h") || t.startsWith("<ul") || t.startsWith("<pre") || t.startsWith("<div") || t.startsWith("<blockquote")) return t;
    return `<p>${t.replace(/\n/g,"<br/>")}</p>`;
  }).join("\n");
  return md;
}

function Outline({ body }: { body: string }) {
  const headings = useMemo(() => {
    const out: { level: number; text: string; id: string }[] = [];
    for (const m of body.matchAll(/^#{1,3}\s+(.+)$/gm)) {
      const line = m[0] ?? "";
      const level = line.startsWith("###") ? 3 : line.startsWith("##") ? 2 : 1;
      const text = (m[1] ?? "").trim();
      out.push({ level, text, id: text.toLowerCase().replace(/\W+/g,"-") });
    }
    return out;
  }, [body]);
  if (headings.length === 0) return <div style={{ color:"var(--muted)", fontSize:13 }}>No headings</div>;
  return <div style={{ fontSize:13, lineHeight:1.7 }}>{headings.map((h) => <div key={h.id} style={{ paddingLeft:(h.level-1)*12, color: h.level===1?"var(--text)":"var(--muted)" }}>{h.level===1?"■":"›"} {h.text}</div>)}</div>;
}

export default function App(){
  const [theme, setTheme] = useState<"dark"|"light">(()=> (localStorage.getItem("theme") as "dark"|"light") || "dark");
  useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("theme", theme); },[theme]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState<string>("");
  const [tree, setTree] = useState<{ kb: TreeNode[]; worklogs: { slug:string; state:string|null; entries:string[] }[] }>({ kb:[], worklogs:[] });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ auth:true, _root:true });
  const [mode, setMode] = useState<"notes"|"graph">("notes");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [paletteHits, setPaletteHits] = useState<SearchHit[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [note, setNote] = useState<NoteResp | null>(null);
  const [graph, setGraph] = useState<GraphResp | null>(null);
  const [graphDepth, setGraphDepth] = useState<1|2>(1);
  const [graphFull, setGraphFull] = useState(false);
  const [worklogSlug, setWorklogSlug] = useState("_root");
  const [worklog, setWorklog] = useState<{ stateBody:string|null; entries:{date:string; body:string; path:string}[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const tabsCtl = useLocalTabs(wsId || "seed");
  const activePath = tabsCtl.active ?? currentPath;

  // load workspaces
  useEffect(()=>{ api.workspaces().then((ws)=>{
    setWorkspaces(ws);
    if(ws.length>0 && !wsId) setWsId(ws[0]!.id);
  }).catch(()=>{}); },[]);

  // load tree when ws changes
  useEffect(()=>{ if(!wsId) return; api.tree(wsId).then((t)=> setTree({ kb: t.kbTree, worklogs: t.worklogsTree })).catch(()=>{}); },[wsId]);

  // search as you type (top bar)
  useEffect(()=>{
    if(!wsId || !q.trim()){ setHits([]); return; }
    const h = setTimeout(()=>{ api.search(wsId, q, { ...(typeFilter?{type:typeFilter}:{}), ...(tagFilter?{tag:tagFilter}:{}) }).then(setHits).catch(()=>{}); },150);
    return ()=> clearTimeout(h);
  },[q, wsId, typeFilter, tagFilter]);

  // palette search
  useEffect(()=>{
    if(!showPalette || !wsId) return;
    if(!paletteQ.trim()){ setPaletteHits([]); return; }
    if(paletteQ.startsWith(">")){ setPaletteHits([]); return; }
    const h = setTimeout(()=> api.search(wsId, paletteQ).then(setPaletteHits).catch(()=>{}),150);
    return ()=> clearTimeout(h);
  },[paletteQ, showPalette, wsId]);

  const openPath = useCallback(async (rel: string, title?: string, newTab=false)=>{
    if(!wsId) return;
    // detect worklog?
    const isWorklog = rel.startsWith("_") || rel.includes("/STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(rel.split("/").pop() ?? "") || rel.includes("_Worklogs");
    // normalize worklog rel: if it's slug/... we keep
    if(rel.includes("STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(rel.split("/").pop() ?? "")){
      // try to detect slug
      const slug = rel.split("/")[0] ?? "_root";
      setWorklogSlug(slug);
      // fetch worklog timeline instead of note tab
      try{ const wl = await api.worklog(wsId, slug); setWorklog(wl); }catch{}
      setCurrentPath(rel);
      tabsCtl.open(rel, title ?? rel, newTab);
      setMode("notes");
      return;
    }
    if(isWorklog && worklog && rel.includes("/")) { /* fallthrough */ }
    tabsCtl.open(rel, title ?? rel, newTab);
    setCurrentPath(rel);
    setMode("notes");
    try{
      const n = await api.note(wsId, rel);
      setNote(n);
      // update tab title
      // backlinks etc will be in note
    }catch{ setNote(null); }
  },[wsId, tabsCtl, worklog]);

  // load active tab content
  useEffect(()=>{
    if(!activePath || !wsId) return;
    setCurrentPath(activePath);
    // if worklog slug path, fetch worklog
    if(activePath.includes("STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(activePath.split("/").pop() ?? "")){
      const slug = activePath.split("/")[0] ?? "_root";
      api.worklog(wsId, slug).then(setWorklog).catch(()=>{});
      // also fetch note for display fallback
      api.note(wsId, activePath).then(setNote).catch(()=> setNote(null));
    } else {
      api.note(wsId, activePath).then(setNote).catch(()=> setNote(null));
    }
  },[activePath, wsId]);

  // graph data
  useEffect(()=>{
    if(mode!=="graph" || !wsId) return;
    const focus = activePath ?? "";
    api.graph(wsId, focus, graphDepth, graphFull).then(setGraph).catch(()=>{});
  },[mode, wsId, activePath, graphDepth, graphFull]);

  // fetch worklog when slug changes
  useEffect(()=>{ if(!wsId) return; api.worklog(wsId, worklogSlug).then(setWorklog).catch(()=>{}); },[wsId, worklogSlug]);

  // keyboard palette
  useEffect(()=>{
    const h = (e: KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setShowPalette((v)=>!v); }
      if(e.key==="Escape") setShowPalette(false);
    };
    window.addEventListener("keydown", h);
    return ()=> window.removeEventListener("keydown", h);
  },[]);

  const toggleExpand = (k:string)=> setExpanded((p)=>({ ...p, [k]: !p[k] }));

  const renderTree = (nodes: TreeNode[], depth=0): React.ReactNode => {
    return nodes.map((n)=>{
      const key = n.path;
      const isExp = expanded[key] ?? (depth===0);
      const isActive = activePath===n.path;
      if(n.isDir){
        return <div key={key}>
          <div className={`row ${isActive?"active":""}`} onClick={()=> toggleExpand(key)}>
            <span className="ch">{isExp?"▾":"▸"}</span><span className="ic">📁</span> {n.name}
            {n.children && <span className="cnt">{n.children.length}</span>}
          </div>
          {isExp && n.children && <div>{renderTree(n.children, depth+1)}</div>}
        </div>;
      }
      return <div key={key} className={`row indent ${isActive?"active":""}`} onClick={()=> openPath(n.path, n.name)}>
        <span className="ic">{n.isIndex?"★":"≡"}</span> {n.name}
      </div>;
    });
  };

  const mdHtml = useMemo(()=> note ? renderMarkdown(note, wsId, (t, nt)=> openPath(t, undefined, nt)) : "", [note, wsId]);

  // handle wikilink clicks via delegation
  const onPaperClick = useCallback((e: React.MouseEvent)=>{
    const target = e.target as HTMLElement;
    const wl = target.closest(".wikilink") as HTMLElement | null;
    if(wl){
      const t = wl.getAttribute("data-target") ?? "";
      const nt = (e as unknown as { metaKey:boolean; ctrlKey:boolean }).metaKey || (e as unknown as { ctrlKey:boolean }).ctrlKey;
      // resolve: try path as target, or target + .md, or find by title
      let rel = t;
      if(!rel.endsWith(".md")) rel = rel + ".md";
      // try exact, then try search
      openPath(t, undefined, nt);
      // optimistic: try api search to resolve title → path
      if(wsId){
        api.search(wsId, t).then((hits)=>{
          if(hits.length>0 && hits[0]!.path !== t){
            openPath(hits[0]!.path, hits[0]!.title, nt);
          }
        }).catch(()=>{});
      }
    }
    const embed = target.closest(".embed") as HTMLElement | null;
    if(embed && embed.textContent?.includes("embed →")){
      const m = embed.textContent.match(/embed →\s*([^\n]+)/);
      if(m) openPath(m[1]!.trim());
    }
  },[wsId, openPath]);

  const isWorklogActive = activePath ? (activePath.includes("STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(activePath.split("/").pop()??"")) : false;

  return <div className="app">
    {/* ribbon */}
    <div className="shell">
      <div className="ribbon">
        <button className={mode==="notes" ? "active": ""} title="Files" onClick={()=> setMode("notes")}>◧</button>
        <button title="Search" onClick={()=> setShowPalette(true)}>⌕</button>
        <button className={mode==="graph" ? "active": ""} title="Graph" onClick={()=> setMode("graph")}>⬡</button>
        <button title="Worklogs" onClick={()=> { const wl = tree.worklogs[0]; if(wl) openPath(wl.state ?? wl.entries[0] ?? "_root/STATE.md"); }}>≡</button>
        <button style={{ marginTop:"auto" }} title="Toggle theme" onClick={()=> setTheme((t)=> t==="dark"?"light":"dark")}>{theme==="dark"?"☀":"◐"}</button>
        <button title="Settings" onClick={()=> api.reindex(wsId).then(()=> api.tree(wsId).then((t)=> setTree({ kb:t.kbTree, worklogs:t.worklogsTree })))}>↻</button>
      </div>

      <div className="left">
        <div className="left-head">
          <b>Files</b> <span style={{ marginLeft:"auto", opacity:.6 }}>⋯</span>
          <div className="vault" onClick={()=> setWsId((id)=>{
            const idx = workspaces.findIndex((w)=> w.id===id);
            const nxt = workspaces[(idx+1)%workspaces.length];
            return nxt ? nxt.id : id;
          })}>◈ {workspaces.find((w)=> w.id===wsId)?.id ?? "seed"} ▾</div>
        </div>
        <input className="search-input" placeholder="Search 342 notes… ⌘K" value={q} onChange={(e)=> setQ(e.target.value)} onFocus={()=> setShowPalette(true)} />
        {q && hits.length>0 && <div style={{ padding:"0 8px", display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflow:"auto" }}>
          {hits.slice(0,6).map((h)=><div key={h.path} className="link" onClick={()=> openPath(h.path, h.title)}><b>{h.title}</b><small>{h.path} • {h.type} — {h.snippet.slice(0,80)}</small></div>)}
        </div>}
        <div style={{ display:"flex", gap:6, padding:"6px 8px" }}>
          {["","spec","note","index"].map((t)=><button key={t} onClick={()=> setTypeFilter(t)} style={{ font:"11px JetBrains Mono,monospace", padding:"3px 7px", borderRadius:10, border:"1px solid var(--border)", background: typeFilter===t ? "var(--accent)" : "var(--card)", color: typeFilter===t ? "#fff" : "var(--muted)", cursor:"pointer" }}>{t||"all"}</button>)}
          <button onClick={()=> setTagFilter(tagFilter? "" : "auth")} style={{ font:"11px JetBrains Mono,monospace", padding:"3px 7px", borderRadius:10, border:"1px solid var(--border)", background: tagFilter ? "var(--accent)" : "var(--card)", color: tagFilter ? "#fff" : "var(--muted)", cursor:"pointer" }}>#auth</button>
        </div>
        <div className="tree">
          <div className="group-title">KB <span style={{ marginLeft:"auto", color:"var(--faint)", fontWeight:400, textTransform:"none" }}>{workspaces.find((w)=> w.id===wsId)?.noteCount ?? ""} files</span></div>
          {renderTree(tree.kb)}
          <div className="group-title" style={{ marginTop:12 }}>WORKLOGS</div>
          {tree.worklogs.map((s)=>{
            const exp = expanded[s.slug] ?? true;
            const active = activePath?.startsWith(s.slug+"/");
            return <div key={s.slug}>
              <div className={`row ${active?"active":""}`} onClick={()=> toggleExpand(s.slug)}><span className="ch">{exp?"▾":"▸"}</span><span className="ic">📁</span> {s.slug}</div>
              {exp && <>
                {s.state && <div className={`row indent ${activePath===s.state?"active":""}`} onClick={()=> openPath(s.state!, "STATE.md")}><span className="ic">◆</span> STATE.md</div>}
                {s.entries.map((p)=><div key={p} className={`row indent ${activePath===p?"active":""}`} onClick={()=> openPath(p, p.split("/").pop())}><span className="ic">≡</span> {p.split("/").pop()}</div>)}
              </>}
            </div>;
          })}
        </div>
      </div>

      <div className="main">
        <div className="tabs">
          {tabsCtl.tabs.map((t)=><div key={t.path} className={`tab ${activePath===t.path?"active":""}`} onClick={()=> tabsCtl.setActive(t.path)}>
            <span className="ic" style={{ opacity:.6 }}>≡</span><span className="title">{t.title.replace(".md","")}</span><span className="close" onClick={(e)=>{ e.stopPropagation(); tabsCtl.close(t.path); }}>×</span>
          </div>)}
          <div className="tab" style={{ opacity:.4, borderTop:"0" }} onClick={()=> setShowPalette(true)}>+</div>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, padding:"0 8px" }}>
            <button onClick={()=> setMode("notes")} style={{ font:"12px Inter,sans-serif", padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", background: mode==="notes"?"var(--hover)":"transparent", color: mode==="notes"?"var(--text)":"var(--muted)", cursor:"pointer" }}>Notes</button>
            <button onClick={()=> setMode("graph")} style={{ font:"12px Inter,sans-serif", padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", background: mode==="graph"?"var(--hover)":"transparent", color: mode==="graph"?"var(--text)":"var(--muted)", cursor:"pointer" }}>Graph</button>
          </div>
        </div>

        {mode==="graph" ? (
          <div className="graph">
            <div className="graph-canvas" style={{ position:"relative" }}>
              {graph ? (()=> {
                // simple radial layout
                const cx=360, cy=180, r=140;
                const nodes = graph.nodes.slice(0,30);
                const pos = new Map<string,{x:number;y:number}>();
                const focusIdx = nodes.findIndex((n)=> n.id===activePath);
                const ordered = focusIdx>=0 ? [nodes[focusIdx]!, ...nodes.filter((_,i)=>i!==focusIdx)] : nodes;
                ordered.forEach((n,i)=>{
                  if(i===0){ pos.set(n.id,{x:cx,y:cy}); }
                  else {
                    const angle = (i-1)/Math.max(1,ordered.length-1)*Math.PI*2;
                    const rr = r + (n.type==="index"?20:0);
                    pos.set(n.id,{x: cx+Math.cos(angle)*rr, y: cy+Math.sin(angle)*rr});
                  }
                });
                return <>
                  <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
                    {graph.edges.slice(0,60).map((e,i)=>{
                      const a=pos.get(e.from), b=pos.get(e.to);
                      if(!a||!b) return null;
                      return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" strokeWidth={ e.type==="depends_on"?1.5:1 } strokeDasharray={e.type==="links_to"?"4 4":"0"} opacity={0.6} />;
                    })}
                  </svg>
                  {ordered.map((n)=>{
                    const p=pos.get(n.id)!;
                    const isActive = n.id===activePath;
                    return <div key={n.id} className={`node ${isActive?"active":""}`} style={{ left:p.x-45, top:p.y-18 }} onClick={()=> openPath(n.id, n.title)} title={n.title}>{n.title.slice(0,18)}</div>;
                  })}
                </>;
              })() : <div style={{ display:"grid", placeItems:"center", height:"100%", color:"var(--muted)" }}>Loading graph…</div>}
              <div className="graph-controls">
                <span>Depth:</span>
                <button onClick={()=> setGraphDepth(1)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", background: graphDepth===1?"var(--accent)":"var(--card)", color: graphDepth===1?"#fff":"var(--muted)", cursor:"pointer" }}>1</button>
                <button onClick={()=> setGraphDepth(2)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", background: graphDepth===2?"var(--accent)":"var(--card)", color: graphDepth===2?"#fff":"var(--muted)", cursor:"pointer" }}>2</button>
                <span style={{ opacity:.4 }}>|</span>
                <button onClick={()=> setGraphFull((v)=>!v)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--accent)", background: graphFull?"var(--accent)":"transparent", color: graphFull?"#fff":"var(--accent)", cursor:"pointer" }}>{graphFull?"Focused":"Full vault"}</button>
              </div>
            </div>
          </div>
        ) : isWorklogActive && worklog ? (
          <div className="content" style={{ justifyContent:"center" }}>
            <div className="paper">
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ font:"11px JetBrains Mono,monospace", color:"var(--muted)" }}>WORKLOG</span>
                <select value={worklogSlug} onChange={(e)=> setWorklogSlug(e.target.value)} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 8px", color:"var(--text)", font:"13px Inter,sans-serif" }}>
                  {tree.worklogs.map((s)=><option key={s.slug} value={s.slug}>{s.slug}</option>)}
                </select>
              </div>
              {worklog.stateBody && <div style={{ borderLeft:"3px solid #E8A743", background:"var(--card)", border:"1px solid var(--border)", borderLeftWidth:3, borderRadius:6, padding:14, marginBottom:16 }}>
                <div style={{ font:"11px Inter,sans-serif", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Pinned — STATE.md</div>
                <div className="md" dangerouslySetInnerHTML={{ __html: worklog.stateBody.slice(0,800).replace(/\n/g,"<br/>") }} />
              </div>}
              {worklog.entries.map((e)=><div key={e.path} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:16, marginBottom:12 }}>
                <div style={{ font:"12px JetBrains Mono,monospace", color:"var(--muted)", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}><span style={{ background:"var(--hover)", padding:"2px 6px", borderRadius:4 }}>{e.date}</span> <span style={{ opacity:.5 }}>{e.path}</span></div>
                <div className="md" dangerouslySetInnerHTML={{ __html: e.body.slice(0,1200).replace(/\n/g,"<br/>") }} />
              </div>)}
            </div>
          </div>
        ) : note ? (
          <div className="content" onClick={onPaperClick}>
            <div className="paper">
              <div className="breadcrumb">{wsId} / {note.relPath.split("/").slice(0,-1).join(" / ")} / <span style={{ color:"var(--text)" }}>{note.title}</span></div>
              <div className="props">
                <div className="props-head">Properties</div>
                <dl className="props-grid">
                  <dt>type</dt><dd>{note.type}</dd>
                  <dt>importance</dt><dd>{note.importance ?? "—"}</dd>
                  <dt>tags</dt><dd>{note.tags.length ? note.tags.map((t)=><span key={t} className="pill">#{t}</span>) : <span style={{ color:"var(--muted)" }}>—</span>}</dd>
                  <dt>epic</dt><dd>{note.epic ?? "—"}</dd>
                </dl>
              </div>
              <h1>{note.title}</h1>
              <div className="md" dangerouslySetInnerHTML={{ __html: mdHtml }} />
            </div>
          </div>
        ) : <div style={{ display:"grid", placeItems:"center", flex:1, color:"var(--muted)", fontSize:14 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>◧</div>
              <div>⌘K to search, or pick a note</div>
              <div style={{ fontSize:12, marginTop:6, opacity:.6 }}>{workspaces.find((w)=> w.id===wsId)?.noteCount ?? 0} notes indexed</div>
            </div>
          </div>}
      </div>

      <div className="right">
        <div className="right-tabs">
          <button className="active">Backlinks</button>
          <button>Outgoing</button>
          <button>Outline</button>
        </div>
        <div className="right-body">
          {note ? <>
            <div className="block">
              <h3>Linked mentions · {note.backlinks.length}</h3>
              {note.backlinks.length ? note.backlinks.slice(0,4).map((b)=><div key={b.path} className="link" onClick={()=> openPath(b.path, b.title)}><b>≡ {b.title}</b><small>…<em>{note.title}</em>… {b.snippet.slice(0,90)}</small></div>) : <div style={{ color:"var(--muted)", fontSize:13 }}>No backlinks</div>}
            </div>
            <div className="block">
              <h3>Outgoing links · {note.outgoing.length}</h3>
              {note.outgoing.slice(0,6).map((o,i)=><div key={i} className="link" onClick={()=> openPath(o.target)}><b style={{ color:"var(--accent2)" }}>↗ {o.target}</b><small>{o.relationType} • {(o.target.includes("/")?o.target: o.target+".md")}</small></div>)}
              {!note.outgoing.length && <div style={{ color:"var(--muted)", fontSize:13 }}>No outgoing links</div>}
            </div>
            <div className="block">
              <h3>Outline</h3>
              <Outline body={note.body} />
            </div>
          </> : worklog ? <>
            <div className="block"><h3>Date jump</h3>{worklog.entries.map((e)=><div key={e.path} className="link" onClick={()=> document.getElementById(e.date)?.scrollIntoView({ behavior:"smooth" })}><b>{e.date}</b><small>{e.path}</small></div>)}</div>
          </> : <div style={{ color:"var(--muted)", fontSize:13 }}>Select a note</div>}
        </div>
      </div>
    </div>

    <div className="status">
      <span>{workspaces.find((w)=> w.id===wsId)?.noteCount ?? 0} notes</span>
      <span>{note?.backlinks.length ?? 0} backlinks</span>
      <span style={{ marginLeft:"auto" }}>{workspaces.find((w)=> w.id===wsId)?.kb ?? "seed"} • index fresh 2m • </span>
      <button onClick={()=> api.reindex(wsId).then(()=> api.tree(wsId).then((t)=> setTree({ kb:t.kbTree, worklogs:t.worklogsTree })))}>Reindex</button>
    </div>

    {showPalette && <div className="palette" onClick={()=> setShowPalette(false)}>
      <div className="palette-box" onClick={(e)=> e.stopPropagation()}>
        <input className="palette-input" autoFocus placeholder="Type to search…  > Graph for commands" value={paletteQ} onChange={(e)=> setPaletteQ(e.target.value)} onKeyDown={(e)=>{
          if(e.key==="Enter"){
            if(paletteQ.startsWith(">")){
              if(paletteQ.toLowerCase().includes("graph")) setMode("graph");
              setShowPalette(false);
            } else if(paletteHits[0]){ openPath(paletteHits[0].path, paletteHits[0].title); setShowPalette(false); }
            else if(hits[0]){ openPath(hits[0].path, hits[0].title); setShowPalette(false); }
          }
          if(e.key==="Escape") setShowPalette(false);
        }} />
        <div className="palette-list">
          {paletteQ.startsWith(">") ? <>
            <div className="palette-item active" onClick={()=>{ setMode("graph"); setShowPalette(false); }}><b>› Graph — Show graph view</b><small>Switch to graph</small></div>
            <div className="palette-item" onClick={()=>{ setMode("notes"); setShowPalette(false); }}><b>› Notes — Show notes</b></div>
          </> : paletteQ ? paletteHits.slice(0,8).map((h,idx)=><div key={h.path} className={`palette-item ${idx===0?"active":""}`} onClick={()=>{ openPath(h.path, h.title); setShowPalette(false); }}>
            <span style={{ width:22, textAlign:"center", opacity:.5 }}>≡</span><div><b>{h.title}</b><small style={{ display:"block", color:"var(--muted)" }}>{h.path} • {h.type} — {h.snippet.slice(0,70)}</small></div>
          </div>) : <div style={{ padding:16, color:"var(--muted)", fontSize:13 }}>Type to search 342 notes… Try “jwt” or “oauth”</div>}
        </div>
      </div>
    </div>}
  </div>;
}
