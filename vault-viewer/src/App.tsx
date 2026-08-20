import React, { useEffect, useMemo, useState } from "react";
import { getWorkspaces, getTree, getNote, search, getGraph, getWorklog, reindex } from "./services/api";
import { Explorer } from "./components/Explorer";
import { Markdown } from "./components/Markdown";
import { GraphView } from "./components/GraphView";
import type { Workspace, TreeNode, WorklogSlug, Note, Tab } from "./types";

function useTheme() {
  const [theme, setTheme] = useState<"dark"|"light">(()=> (localStorage.getItem("theme") as any) ?? "dark");
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);
  return { theme, toggle: ()=> setTheme(t=> t==="dark" ? "light" : "dark") };
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<string>("");
  const [kbTree, setKbTree] = useState<TreeNode|null>(null);
  const [worklogs, setWorklogs] = useState<WorklogSlug[]>([]);
  const [notesMeta, setNotesMeta] = useState<any[]>([]);
  const [tabs, setTabs] = useState<Tab[]>(()=>{
    try { return JSON.parse(localStorage.getItem("tabs:seed") ?? "[]"); } catch { return []; }
  });
  const [activePath, setActivePath] = useState<string>("");
  const [note, setNote] = useState<Note | null>(null);
  const [mode, setMode] = useState<"note"|"graph">("note");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [graph, setGraph] = useState<any>(null);
  const [fullGraph, setFullGraph] = useState(false);
  const [depth, setDepth] = useState(1);
  const [worklogFocus, setWorklogFocus] = useState<string>("_root");
  const [worklogData, setWorklogData] = useState<WorklogSlug|null>(null);
  const [toast, setToast] = useState<string>("");

  // load workspaces
  useEffect(()=>{
    getWorkspaces().then(r=>{
      setWorkspaces(r.workspaces);
      if (r.workspaces[0]) setActiveWs(r.workspaces[0].id);
    });
  }, []);

  // load tree when ws changes
  useEffect(()=>{
    if (!activeWs) return;
    getTree(activeWs).then(r=>{
      setKbTree(r.kbTree);
      setWorklogs(r.worklogs);
      setNotesMeta(r.notes ?? []);
      // restore tabs per workspace
      try {
        const saved = JSON.parse(localStorage.getItem(`tabs:${activeWs}`) ?? "[]");
        if (saved.length) setTabs(saved);
      } catch {}
    });
    // load graph
    getGraph(activeWs, null, 1, true).then(setGraph).catch(()=>{});
  }, [activeWs]);

  // persist tabs
  useEffect(()=>{
    if (activeWs) localStorage.setItem(`tabs:${activeWs}`, JSON.stringify(tabs));
  }, [tabs, activeWs]);

  // search debounce
  useEffect(()=>{
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(async()=>{
      const r = await search(activeWs, q).catch(()=>({hits:[]}));
      setHits(r.hits ?? []);
    }, 180);
    return ()=> clearTimeout(t);
  }, [q, activeWs]);

  // load note when activePath changes
  useEffect(()=>{
    if (!activePath || !activeWs) return;
    // if worklog STATE or date, treat as worklog view but still fetch note for content?
    // For worklog slugs, we want timeline view instead of single note
    if (activePath.endsWith("STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(activePath.split("/").pop() ?? "")) {
      // check if it's in worklogs path (contains slug)
      const slug = activePath.split("/")[0]!;
      const isWorklogPath = worklogs.some(w=>w.slug===slug);
      if (isWorklogPath) {
        setWorklogFocus(slug);
        getWorklog(activeWs, slug).then(setWorklogData).catch(()=>{});
        // also fetch note for single if needed
        getNote(activeWs, activePath).then(setNote).catch(()=>setNote(null));
        setMode("note");
        return;
      }
    }
    getNote(activeWs, activePath).then(n=>{
      setNote(n);
      setMode("note");
    }).catch(()=> setNote(null));
    // update graph focus
    if (activeWs) {
      getGraph(activeWs, activePath, depth, fullGraph).then(setGraph).catch(()=>{});
    }
  }, [activePath, activeWs, depth, fullGraph, worklogs]);

  // refresh graph when depth/full changes
  useEffect(()=>{
    if (mode==="graph" && activeWs) {
      getGraph(activeWs, activePath || null, depth, fullGraph).then(setGraph);
    }
  }, [depth, fullGraph, mode]);

  // keyboard: Cmd+K
  useEffect(()=>{
    const onKey = (e:KeyboardEvent)=>{
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k") { e.preventDefault(); setShowPalette(v=>!v); }
      if (e.key==="Escape") setShowPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return ()=> window.removeEventListener("keydown", onKey);
  }, []);

  const openPath = (p:string, newTab=false) => {
    const existing = tabs.find(t=>t.relPath===p);
    if (!existing) {
      const title = p.split("/").pop()?.replace(".md","") ?? p;
      setTabs(prev=> [...prev, { relPath:p, title }]);
    }
    setActivePath(p);
    if (!newTab) setShowPalette(false);
    else {
      // newTab just ensures we don't reuse? Already added
    }
  };

  const closeTab = (p:string, e?:React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev=>{
      const idx = prev.findIndex(t=>t.relPath===p);
      const next = prev.filter(t=>t.relPath!==p);
      if (p===activePath) {
        const fallback = next[idx] ?? next[idx-1] ?? next[0];
        if (fallback) setActivePath(fallback.relPath);
        else setActivePath("");
      }
      return next;
    });
  };

  const handleWikilink = (target:string, newTab:boolean) => {
    // resolve target to relPath: try title match or direct .md
    const candidates: string[] = [];
    // exact relPaths
    const byTitle = notesMeta.find(n=> n.title.toLowerCase()===target.toLowerCase());
    if (byTitle) candidates.push(byTitle.relPath);
    candidates.push(`${target}.md`);
    candidates.push(`auth/${target}.md`);
    candidates.push(`search/${target}.md`);
    // also try lower case path
    const direct = notesMeta.find(n=> n.relPath.toLowerCase()===`${target.toLowerCase()}.md`);
    if (direct) { openPath(direct.relPath, newTab); return; }
    if (byTitle) { openPath(byTitle.relPath, newTab); return; }
    // fallback open as unresolved tab (still show 404 note)
    const fallback = `${target}.md`;
    openPath(fallback, newTab);
  };

  // determine if activePath is worklog timeline
  const isWorklogTimeline = useMemo(()=>{
    if (!activePath) return false;
    const slug = activePath.split("/")[0]!;
    return worklogs.some(w=>w.slug===slug);
  }, [activePath, worklogs]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
      {/* Top bar */}
      <div style={{ height:36, background:"var(--panel)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12, padding:"0 12px", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:6, height:6, background:"var(--accent)", borderRadius:2, display:"inline-block" }} />
          <select value={activeWs} onChange={e=>setActiveWs(e.target.value)} style={{ background:"var(--panel2)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"Fragment Mono" }}>
            {workspaces.map(w=>(
              <option key={w.id} value={w.id}>◈ {w.id} — {w.tildifiedKb}</option>
            ))}
          </select>
          <span style={{ fontSize:11, color:"var(--muted)", border:"1px solid var(--border)", padding:"2px 6px", borderRadius:4, background:"var(--panel2)" }}>{workspaces.find(w=>w.id===activeWs)?.noteCount ?? 0} notes</span>
        </div>

        <div style={{ flex:1, maxWidth:480, display:"flex", alignItems:"center", gap:8, background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"5px 10px", color:"var(--muted)" }}>
          <span style={{ opacity:.6 }}>⌕</span>
          <input
            value={q}
            onChange={e=>{ setQ(e.target.value); setShowPalette(true); }}
            onFocus={()=> setShowPalette(true)}
            placeholder="Search  titles, tags, body…  (⌘K)"
            style={{ flex:1, background:"transparent", border:0, outline:"none", color:"var(--text)", fontSize:12, fontFamily:"Fragment Mono" }}
          />
          <kbd style={{ background:"var(--panel2)", border:"1px solid var(--border)", padding:"1px 5px", borderRadius:3, fontSize:10 }}>⌘K</kbd>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <div style={{ display:"flex", background:"var(--panel2)", border:"1px solid var(--border)", borderRadius:6, overflow:"hidden" }}>
            <button onClick={()=>setMode("note")} style={{ padding:"5px 10px", fontSize:11, background: mode==="note" ? "var(--accent)" : "transparent", color: mode==="note" ? "#fff" : "var(--muted)", border:0, cursor:"pointer" }}>Notes</button>
            <button onClick={()=>{ setMode("graph"); if (activeWs) getGraph(activeWs, activePath||null, depth, fullGraph).then(setGraph); }} style={{ padding:"5px 10px", fontSize:11, background: mode==="graph" ? "var(--accent)" : "transparent", color: mode==="graph" ? "#fff" : "var(--muted)", border:0, cursor:"pointer" }}>Graph</button>
          </div>
          <button onClick={toggle} style={{ width:32, height:28, display:"grid", placeItems:"center", background:"var(--panel2)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text)", cursor:"pointer" }} title="Toggle theme">
            {theme==="dark" ? "◐" : "☀"}
          </button>
        </div>
      </div>

      {/* Palette */}
      {showPalette && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:30, display:"grid", placeItems:"start center", paddingTop:80 }} onClick={()=>setShowPalette(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:640, maxWidth:"90vw", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:10, boxShadow:"0 16px 48px rgba(0,0,0,.4)", overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderBottom:"1px solid var(--border)" }}>
              <span style={{ color:"var(--muted)" }}>⌕</span>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search notes…  type:spec tag:auth" style={{ flex:1, background:"transparent", border:0, outline:"none", color:"var(--text)", fontSize:13, fontFamily:"Fragment Mono" }} />
              <button onClick={()=>setShowPalette(false)} style={{ background:"var(--panel2)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 8px", fontSize:11, color:"var(--muted)", cursor:"pointer" }}>ESC</button>
            </div>
            <div style={{ maxHeight:360, overflow:"auto", padding:8 }}>
              <div style={{ fontSize:11, color:"var(--muted)", padding:"6px 8px", letterSpacing:".06em", textTransform:"uppercase" }}>Results · {hits.length}</div>
              {hits.map(h=>(
                <div key={h.relPath} onClick={()=>openPath(h.relPath)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:6, cursor:"pointer", border:"1px solid transparent" }} onMouseEnter={e=> (e.currentTarget.style.background="var(--panel2)")} onMouseLeave={e=> e.currentTarget.style.background="transparent"}>
                  <span style={{ width:22, height:22, display:"grid", placeItems:"center", background:"var(--panel2)", border:"1px solid var(--border)", borderRadius:4, fontSize:10 }}>≡</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:"var(--text)", fontWeight:500 }}>{h.title}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.snippet} <span style={{ opacity:.6 }}>— {h.relPath}</span></div>
                  </div>
                  <span style={{ fontSize:10, background:"var(--panel2)", border:"1px solid var(--border)", padding:"2px 6px", borderRadius:10, color:"var(--muted)" }}>{h.type}</span>
                </div>
              ))}
              {hits.length===0 && q.trim() && <div style={{ padding:"20px 14px", color:"var(--muted)", textAlign:"center", fontSize:12 }}>No hits — try different terms or filters</div>}
              {!q.trim() && <div style={{ padding:"12px 14px", color:"var(--muted)", fontSize:11 }}>
                Tips: <code style={{ background:"var(--panel2)", padding:"1px 4px", borderRadius:3 }}>tag:jwt</code> <code style={{ background:"var(--panel2)", padding:"1px 4px", borderRadius:3 }}>type:spec</code> · Press Enter to open top hit
              </div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex:1, display:"grid", gridTemplateColumns:"44px 260px 1fr 300px", minHeight:0 }}>
        {/* Rail */}
        <div style={{ width:44, background:"var(--panel)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0", gap:10 }}>
          <div style={{ width:28, height:28, background:"var(--accent)", color:"#fff", display:"grid", placeItems:"center", borderRadius:6, fontSize:13 }}>◧</div>
          <div style={{ width:28, height:28, display:"grid", placeItems:"center", color:"var(--muted)", fontSize:13, borderRadius:6, background: q ? "var(--panel2)" : "transparent" }} onClick={()=>setShowPalette(true)} title="Search">⌕</div>
          <div style={{ width:28, height:28, display:"grid", placeItems:"center", color: mode==="graph" ? "#fff" : "var(--muted)", background: mode==="graph" ? "var(--accent)" : "transparent", borderRadius:6, fontSize:13, cursor:"pointer" }} onClick={()=>setMode("graph")} title="Graph">⬡</div>
          <div style={{ width:28, height:28, display:"grid", placeItems:"center", color:"var(--muted)", fontSize:13 }} title="Worklogs">≡</div>
          <div style={{ marginTop:"auto", width:28, height:28, display:"grid", placeItems:"center", color:"var(--muted)", fontSize:13, border:"1px solid var(--border)", borderRadius:6, cursor:"pointer" }} onClick={toggle} title="Theme">◐</div>
        </div>

        {/* Left */}
        <div style={{ background:"var(--panel)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ height:32, display:"flex", alignItems:"center", padding:"0 10px", borderBottom:"1px solid var(--border)", fontSize:11, letterSpacing:".08em", textTransform:"uppercase", color:"var(--muted)", gap:8 }}>
            <span style={{ width:6, height:6, background:"var(--accent)", borderRadius:2, display:"inline-block" }} /> Explorer
            <span style={{ marginLeft:"auto", fontSize:10, background:"var(--panel2)", border:"1px solid var(--border)", padding:"1px 5px", borderRadius:4 }}>{workspaces.find(w=>w.id===activeWs)?.noteCount ?? 0}</span>
          </div>
          <Explorer kbTree={kbTree} worklogs={worklogs} active={activePath} onOpen={openPath} onWorklogSlug={setWorklogFocus} />
        </div>

        {/* Main */}
        <div style={{ background:"var(--bg)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
          {/* Tabs */}
          <div style={{ height:32, background:"var(--panel)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"stretch", gap:2, padding:"0 6px", overflowX:"auto" }}>
            {tabs.map(t=>(
              <div key={t.relPath} onClick={()=>setActivePath(t.relPath)} style={{ display:"flex", alignItems:"center", gap:6, padding:"0 10px", fontSize:12, background: t.relPath===activePath ? "var(--bg)" : "var(--panel)", color: t.relPath===activePath ? "var(--text)" : "var(--muted)", borderRight:"1px solid var(--border)", borderBottom: t.relPath===activePath ? "1px solid var(--bg)" : "1px solid transparent", marginBottom:-1, cursor:"pointer", whiteSpace:"nowrap", borderTop: t.relPath===activePath ? "2px solid var(--accent)" : "2px solid transparent" }}>
                <span style={{ opacity:.6, fontSize:11 }}>{t.relPath.includes("STATE") ? "◆" : "≡"}</span>
                {t.title}
                <span onClick={(e)=>closeTab(t.relPath, e)} style={{ width:14, height:14, display:"grid", placeItems:"center", borderRadius:3, fontSize:10, marginLeft:4, opacity:.6 }} role="button">×</span>
              </div>
            ))}
            {tabs.length===0 && <div style={{ padding:"0 10px", display:"flex", alignItems:"center", color:"var(--muted)", fontSize:11 }}>No open notes — pick from Explorer or ⌘K</div>}
          </div>

          {/* Content */}
          {mode==="graph" ? (
            <GraphView graph={graph} focus={activePath||null} onSelect={openPath} full={fullGraph} setFull={setFullGraph} depth={depth} setDepth={setDepth} />
          ) : isWorklogTimeline && worklogData ? (
            <div style={{ flex:1, overflow:"auto", padding:"16px 0", display:"flex", justifyContent:"center" }}>
              <div style={{ width:720, maxWidth:"92%" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <select value={worklogFocus} onChange={e=>{ setWorklogFocus(e.target.value); getWorklog(activeWs, e.target.value).then(setWorklogData); }} style={{ background:"var(--panel)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"6px 10px", fontSize:12, fontFamily:"Fragment Mono" }}>
                    {worklogs.map(w=> <option key={w.slug} value={w.slug}>▾ {w.slug}</option>)}
                  </select>
                  <span style={{ fontSize:11, color:"var(--muted)", background:"var(--panel)", border:"1px solid var(--border)", padding:"3px 7px", borderRadius:4 }}>{worklogData.entries.length} entries</span>
                  <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted)" }}>{activePath}</span>
                </div>
                {/* STATE pinned */}
                {worklogData.stateExists && (
                  <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderLeft:"3px solid var(--amber)", borderRadius:8, padding:"14px 16px", marginBottom:14, boxShadow:"0 2px 12px rgba(0,0,0,.15)" }}>
                    <div style={{ fontSize:11, letterSpacing:".08em", textTransform:"uppercase", color:"var(--amber)", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><span style={{ width:6, height:6, background:"var(--amber)", borderRadius:2, display:"inline-block" }} /> STATE.md — pinned</div>
                    <div style={{ fontSize:12, lineHeight:1.6, color:"var(--text)" }}>
                      <Markdown body={worklogData.stateBody ?? ""} workspace={activeWs} currentPath={`${worklogFocus}/STATE.md`} onWikilink={handleWikilink} />
                    </div>
                  </div>
                )}
                {worklogData.entries.map(e=>(
                  <div key={e.relPath} id={e.date} style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, padding:"14px 16px", marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ background:"var(--accent)", color:"#fff", fontSize:11, padding:"2px 7px", borderRadius:4, fontFamily:"Fragment Mono" }}>{e.date}</span>
                      <span style={{ width:24, height:1, background:"var(--border)" }} /> {/* perforated */}
                      <span style={{ fontSize:11, color:"var(--muted)" }}>{e.relPath}</span>
                    </div>
                    <div style={{ fontSize:12, lineHeight:1.6, color:"var(--text)" }}>
                      <Markdown body={e.body} workspace={activeWs} currentPath={e.relPath} onWikilink={handleWikilink} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !activePath ? (
            <div style={{ flex:1, display:"grid", placeItems:"center", padding:40, textAlign:"center", color:"var(--muted)" }}>
              <div>
                <div style={{ fontSize:28, marginBottom:10, color:"var(--faint)" }}>▸</div>
                <div style={{ fontSize:13, color:"var(--text)", fontWeight:500, marginBottom:6 }}>No note open</div>
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:14 }}>Pick from Explorer or hit <kbd style={{ background:"var(--panel2)", border:"1px solid var(--border)", padding:"1px 5px", borderRadius:3 }}>⌘K</kbd> to search</div>
                <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                  {notesMeta.slice(0,4).map(n=>(
                    <button key={n.relPath} onClick={()=>openPath(n.relPath)} style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:6, padding:"6px 10px", fontSize:11, color:"var(--text)", cursor:"pointer" }}>{n.title}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : note ? (
            <div style={{ flex:1, overflow:"auto", display:"flex", justifyContent:"center", padding:"16px 0" }}>
              <div style={{ width:720, maxWidth:"92%" }}>
                {/* breadcrumb */}
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:10, fontFamily:"Fragment Mono", display:"flex", alignItems:"center", gap:6 }}>
                  <span>{activePath.split("/").slice(0,-1).join(" / ") || "—"}</span>
                  <span style={{ opacity:.3 }}>/</span>
                  <b style={{ color:"var(--text)", fontWeight:500 }}>{note.title}</b>
                  <span style={{ marginLeft:"auto", fontSize:10, background:"var(--panel)", border:"1px solid var(--border)", padding:"2px 6px", borderRadius:4 }}>{note.relPath}</span>
                </div>
                <h1 style={{ fontFamily:"Inter,sans-serif", fontSize:18, fontWeight:600, letterSpacing:"-.01em", margin:"0 0 10px", lineHeight:1.2 }}>{note.title}</h1>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                  <span style={{ fontSize:10, letterSpacing:".06em", textTransform:"uppercase", background:"var(--panel2)", border:"1px solid var(--border)", padding:"3px 7px", borderRadius:4, color:"var(--muted)" }}><b style={{ color:"var(--accent)", fontWeight:500 }}>type</b> {note.type}</span>
                  {note.importance!==null && <span style={{ fontSize:10, letterSpacing:".06em", textTransform:"uppercase", background: (note.importance>=8 ? "var(--red)" : "var(--panel2)"), color: note.importance>=8 ? "#fff" : "var(--muted)", border:"1px solid var(--border)", padding:"3px 7px", borderRadius:4 }}><b>imp</b> {note.importance}</span>}
                  {note.tags && <span style={{ fontSize:10, letterSpacing:".06em", textTransform:"uppercase", background:"var(--panel2)", border:"1px solid var(--border)", padding:"3px 7px", borderRadius:4, color:"var(--muted)" }}><b style={{ color:"var(--accent2)" }}>tags</b> {note.tags}</span>}
                  {note.epic && <span style={{ fontSize:10, letterSpacing:".06em", textTransform:"uppercase", background:"var(--panel2)", border:"1px solid var(--border)", padding:"3px 7px", borderRadius:4, color:"var(--muted)" }}><b>epic</b> {note.epic}</span>}
                </div>
                {/* line numbers + markdown */}
                <div style={{ display:"flex", gap:0, background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,.2)" }}>
                  <div style={{ width:36, background:"var(--panel2)", borderRight:"1px solid var(--border)", color:"var(--muted)", textAlign:"right", padding:"14px 6px 14px", fontSize:11, lineHeight:1.7, userSelect:"none", opacity:.6 }}>
                    {note.body.split("\n").slice(0,40).map((_,i)=> <div key={i}>{i+1}</div>)}
                  </div>
                  <div style={{ flex:1, padding:"14px 18px", fontSize:12.5, lineHeight:1.7, color:"var(--text)", overflow:"auto" }}>
                    <Markdown body={note.body} workspace={activeWs} currentPath={note.relPath} onWikilink={handleWikilink} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding:40, textAlign:"center", color:"var(--muted)" }}>
              <div style={{ fontSize:13, color:"var(--red)", marginBottom:6 }}>Not found</div>
              <div style={{ fontSize:12 }}>{activePath} — unresolved wikilink or missing file</div>
              <button onClick={()=>closeTab(activePath)} style={{ marginTop:12, background:"var(--panel2)", border:"1px solid var(--border)", padding:"6px 10px", borderRadius:6, fontSize:11, cursor:"pointer", color:"var(--text)" }}>Close tab</button>
            </div>
          )}
        </div>

        {/* Right dock */}
        <div style={{ background:"var(--panel)", borderLeft:"1px solid var(--border)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ height:32, display:"flex", borderBottom:"1px solid var(--border)", overflowX:"auto" }}>
            {[
              {k:"backlinks", l:`Backlinks · ${note?.backlinks.length ?? 0}`},
              {k:"outgoing", l:`Outgoing · ${note?.outgoing.length ?? 0}`},
              {k:"outline", l:"Outline"},
              {k:"tags", l:"Tags"},
            ].map(t=>(
              <div key={t.k} style={{ padding:"0 10px", display:"grid", placeItems:"center", fontSize:11, whiteSpace:"nowrap", borderBottom:"2px solid var(--accent)", color:"var(--text)", opacity: t.k==="backlinks" ? 1 : .5 }}>{t.l}</div>
            ))}
          </div>
          <div style={{ flex:1, overflow:"auto", padding:12, display:"flex", flexDirection:"column", gap:14 }}>
            {/* Outgoing */}
            <div>
              <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"var(--accent)", display:"inline-block", borderRadius:2 }} /> Outgoing</div>
              {note?.outgoing.length ? note.outgoing.map((r,i)=>(
                <div key={i} onClick={()=>handleWikilink(r.target,false)} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 9px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, marginBottom:6, cursor:"pointer", fontSize:12 }}>
                  <span style={{ fontSize:10, background:"var(--panel2)", border:"1px solid var(--border)", padding:"1px 5px", borderRadius:4 }}>{r.relationType}</span>
                  <span style={{ color:"var(--accent)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.target}</span>
                </div>
              )) : <div style={{ fontSize:11, color:"var(--muted)", background:"var(--bg)", border:"1px dashed var(--border)", borderRadius:6, padding:"10px", textAlign:"center" }}>No outgoing links</div>}
            </div>
            {/* Backlinks */}
            <div>
              <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"var(--accent2)", display:"inline-block", borderRadius:2 }} /> Backlinks</div>
              {note?.backlinks.length ? note.backlinks.map(b=>(
                <div key={b.relPath} onClick={()=>openPath(b.relPath)} style={{ padding:"8px 9px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, marginBottom:6, cursor:"pointer" }}>
                  <div style={{ fontSize:12, color:"var(--text)", fontWeight:500, display:"flex", alignItems:"center", gap:6 }}><span style={{ width:6, height:6, background:"var(--accent2)", borderRadius:"50%", display:"inline-block" }} />{b.title}</div>
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:3, lineHeight:1.4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }} dangerouslySetInnerHTML={{__html: b.snippet.replace(new RegExp(note.title, "gi"), m=>`<span style="color:var(--accent);background:rgba(108,92,255,.15);padding:0 2px;border-radius:2px">${m}</span>`) }} />
                  <div style={{ fontSize:10, color:"var(--faint)", marginTop:4 }}>{b.relPath}</div>
                </div>
              )) : <div style={{ fontSize:11, color:"var(--muted)", background:"var(--bg)", border:"1px dashed var(--border)", borderRadius:6, padding:"10px", textAlign:"center" }}>No backlinks</div>}
            </div>
            {/* Tags */}
            <div>
              <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Tags</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {note?.tags ? note.tags.split(/\s+/).filter(Boolean).map(t=>(
                  <span key={t} style={{ fontSize:11, background:"var(--accent)", color:"#fff", padding:"2px 7px", borderRadius:10 }}>{`#${t}`}</span>
                )) : <span style={{ fontSize:11, color:"var(--muted)" }}>—</span>}
              </div>
            </div>
            {/* Outline */}
            <div>
              <div style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Outline</div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.7, fontFamily:"Fragment Mono" }}>
                {note?.body ? note.body.split("\n").filter(l=>l.startsWith("#")).slice(0,8).map((h,i)=>(
                  <div key={i} style={{ paddingLeft: (h.match(/^#+/)?.[0].length ?? 1)*8, color: i===0 ? "var(--text)" : "var(--muted)", fontWeight: i===0?600:400 }}>{h.replace(/^#+\s*/,"")}</div>
                )) : <div style={{ fontStyle:"italic" }}>No headings</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div style={{ height:20, background:"var(--accent)", color:"#fff", display:"flex", alignItems:"center", gap:12, padding:"0 10px", fontSize:11, fontFamily:"Fragment Mono", flexShrink:0 }}>
        <span>{workspaces.find(w=>w.id===activeWs)?.noteCount ?? 0} notes</span>
        <span style={{ opacity:.8 }}>index {workspaces.find(w=>w.id===activeWs)?.indexFresh ?? "…"}</span>
        <span style={{ opacity:.8 }}>vault: {workspaces.find(w=>w.id===activeWs)?.tildifiedKb ?? ""}</span>
        <button onClick={async()=>{
          if (!activeWs) return;
          setToast("Reindexing…");
          const r = await reindex(activeWs).catch(()=>null);
          setToast(r ? `Reindexed: ${r.total} notes` : "Reindex done");
          setTimeout(()=>setToast(""), 2500);
          // refresh tree
          getTree(activeWs).then(t=>{ setKbTree(t.kbTree); setWorklogs(t.worklogs); });
        }} style={{ marginLeft:"auto", background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", borderRadius:4, padding:"2px 8px", fontSize:10, cursor:"pointer" }}>Reindex</button>
        <span style={{ opacity:.9 }}>localhost:3415 • console • viewer only</span>
      </div>

      {toast && <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"var(--panel)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px 14px", borderRadius:8, fontSize:12, boxShadow:"0 8px 24px rgba(0,0,0,.3)", zIndex:40 }}>{toast}</div>}
    </div>
  );
}
