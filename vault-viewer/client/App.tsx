import React, { useEffect, useMemo, useState } from "react";
import { fetchWorkspaces, fetchTree, fetchNote, fetchSearch, fetchGraph, fetchWorklog, postReindex } from "./services/api";
import type { Workspace, TreeNode, NoteDetail, Graph, Worklog } from "./types";

type Tab = { path: string; title: string; type: "note" | "worklog" };

function useTheme(){
  const [theme, setTheme] = useState<"light"|"dark">(()=> (localStorage.getItem("theme") as any) ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark":"light"));
  useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("theme", theme); },[theme]);
  return { theme, toggle:()=> setTheme(t=> t==="light"?"dark":"light") };
}

function TreeView({ nodes, activePath, onOpen, expanded, toggle }: { nodes: TreeNode[]; activePath:string; onOpen:(p:string)=>void; expanded:Set<string>; toggle:(p:string)=>void }){
  return <>{nodes.map(n=>{
    const isDir = n.type==="dir";
    const isExpanded = expanded.has(n.path);
    if(isDir){
      return <div key={n.path}>
        <div className="row" onClick={()=>toggle(n.path)}><span className="ic">{isExpanded?"▾":"▸"}</span> {n.name} <span className="count">{n.children?.length ?? 0}</span></div>
        {isExpanded && n.children && <div><TreeView nodes={n.children} activePath={activePath} onOpen={onOpen} expanded={expanded} toggle={toggle} /></div>}
      </div>;
    } else {
      const isActive = activePath===n.path;
      return <div key={n.path} className={`row indent ${isActive?"active":""}`} onClick={()=>onOpen(n.path)}><span className="ic">≡</span> {n.name} {n.title && n.title!==n.name.replace(/\.md$/,"") ? <span className="muted" style={{marginLeft:4}}>{n.title}</span>:null}</div>;
    }
  })}</>;
}

// Minimal markdown renderer: preprocess wikilinks/embeds/callouts then use react-markdown
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import mermaid from "mermaid";
mermaid.initialize({ startOnLoad:false, theme:"base", themeVariables:{ primaryColor:"#2A9D8F" } });

function preprocessMermaid(body:string){
  return body;
}

function NoteView({ note, workspace, onWikilink }: { note: NoteDetail; workspace:string; onWikilink:(target:string, newTab:boolean)=>void }){
  const [mermaidDone, setMermaidDone] = useState(false);
  // Transform wikilinks [[a|b]] and ![[embed]] before markdown
  const transformed = useMemo(()=>{
    let t = note.body;
    // callouts: > [!NOTE] -> keep as blockquote, react-markdown will render; we style via css
    // embeds ![[X]] -> custom marker EMBED:X
    t = t.replace(/!\[\[([^\]]+)\]\]/g, (_m, target)=>{
      const clean = target.split("|")[0]!.trim();
      return `\n\n> **Embed: ${clean}**  \n> *embedded note preview — open [[${clean}]] to view* \n\n`;
    });
    // wikilinks [[X|Alias]] -> [Alias](wikilink:encoded)
    t = t.replace(/\[\[([^\]]+)\]\]/g, (_m, inside)=>{
      const [target, alias] = inside.split("|").map((s:string)=>s.trim());
      const label = alias || target;
      const enc = encodeURIComponent(target);
      return `[${label}](wikilink:${enc})`;
    });
    // inline tags #tag -> keep as text but style later
    // images: ![alt](path) -> rewrite src to api
    // we handle in component mapping
    return t;
  },[note.body]);

  useEffect(()=>{
    // render mermaid blocks after mount
    const els = document.querySelectorAll(".mermaid");
    if(els.length && !mermaidDone){
      mermaid.run({ nodes: Array.from(els) as any }).then(()=> setMermaidDone(true));
    }
  },[transformed, mermaidDone]);

  // Reset mermaid flag when note changes
  useEffect(()=> setMermaidDone(false),[note.path]);

  return <div className="body">
    <ReactMarkdown
      urlTransform={(url)=> url.startsWith("wikilink:") ? url : url}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ href, children }: any)=>{
          if(href?.startsWith("wikilink:")){
            const raw = href.slice("wikilink:".length);
            const target = decodeURIComponent(raw);
            return <a href="#" onClick={(e)=>{
              e.preventDefault();
              const newTab = (e as any).metaKey || (e as any).ctrlKey;
              onWikilink(target, newTab);
            }}>{children}</a>;
          }
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
        img: ({ src, alt }: any)=>{
          if(!src) return null;
          // resolve relative to vault
          // if src is absolute http, keep
          if(src.startsWith("http")) return <img src={src} alt={alt} />;
          // vault-relative: note path dir + src
          const dir = note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")+1) : "";
          const rel = src.startsWith("/") ? src.slice(1) : (dir + src);
          const url = `/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(rel)}`;
          return <span className="img"><span className="img-top">◧ {alt || rel} — vault</span><span className="img-body"><img src={url} alt={alt} onError={(e)=>{(e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).parentElement!.textContent="image not found: "+rel;}} /></span></span>;
        },
        code: ({ inline, className, children }: any)=>{
          const raw = String(className || "");
          const lang = raw.includes("language-mermaid") ? "mermaid" : raw.replace("language-","").replace("hljs","").trim();
          const code = String(children).trim();
          if(!inline && lang==="mermaid"){
            return <pre className="mermaid" style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:8,padding:12}}>{code}</pre>;
          }
          if(!inline) return <pre><code className={className}>{children}</code></pre>;
          return <code>{children}</code>;
        },
        blockquote: ({ children }: any)=>{
          return <blockquote className="callout-bq">{children}</blockquote>;
        }
      }}
    >{transformed}</ReactMarkdown>
  </div>;
}

function GraphView({ graph, onNodeClick, activePath }: { graph: Graph|null; onNodeClick:(id:string)=>void; activePath:string }){
  if(!graph) return <div style={{padding:24,color:"var(--muted)"}} className="mono">Loading graph…</div>;
  // Very simple layout: circular + force approximation without d3, for v1 place nodes in circle
  const nodes = graph.nodes;
  const size = Math.max(400, nodes.length*22);
  const cx = size/2, cy = size/2, r = Math.min(cx,cy)-60;
  const pos = new Map<string,{x:number,y:number}>();
  nodes.forEach((n,i)=>{
    const ang = (i / Math.max(1,nodes.length)) * Math.PI*2 - Math.PI/2;
    const jitter = (i%3)*12;
    pos.set(n.id, { x: cx + Math.cos(ang)*(r - jitter), y: cy + Math.sin(ang)*(r - jitter)});
  });
  return <div className="graph-wrap">
    <div className="graph-canvas" style={{minHeight:520}}>
      <svg width={size} height={size} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        {graph.edges.map((e,i)=>{
          const a = pos.get(e.source), b = pos.get(e.target);
          if(!a||!b) return null;
          const isTyped = e.relationType!=="links_to";
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isTyped?"var(--teal)":"var(--line)"} strokeWidth={isTyped?1.4:1} strokeDasharray={isTyped?"0":"0"} opacity={isTyped?0.7:0.5} />;
        })}
      </svg>
      {nodes.map(n=>{
        const p = pos.get(n.id)!;
        const active = n.id===activePath;
        return <div key={n.id} className={`node ${active?"active":""}`} style={{left:p.x, top:p.y}} onClick={()=>onNodeClick(n.id)} title={`${n.title} — ${n.type}`}>
          {n.title} <span className="muted" style={{marginLeft:6,fontSize:10}}>{n.type}</span>
        </div>;
      })}
    </div>
  </div>;
}

export default function App(){
  const { theme, toggle } = useTheme();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<string>("");
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [worklogs, setWorklogs] = useState<any[]>([]);
  const [noteCount, setNoteCount] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["auth","search","_root","feat-auth"]));
  const [tabs, setTabs] = useState<Tab[]>(()=>{
    try{ const raw = localStorage.getItem("tabs:seed"); if(raw) return JSON.parse(raw);}catch{} return [{path:"auth/jwt.md", title:"JWT Handling", type:"note"}];
  });
  const [activePath, setActivePath] = useState<string>(()=> tabs[0]?.path ?? "auth/jwt.md");
  const [note, setNote] = useState<NoteDetail|null>(null);
  const [mode, setMode] = useState<"note"|"graph">("note");
  const [graph, setGraph] = useState<Graph|null>(null);
  const [graphDepth, setGraphDepth] = useState<1|2>(1);
  const [graphFull, setGraphFull] = useState(false);
  const [worklog, setWorklog] = useState<Worklog|null>(null);
  const [worklogSlug, setWorklogSlug] = useState("_root");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [filterType, setFilterType] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const activeTab = tabs.find(t=>t.path===activePath) ?? tabs[0];

  // load workspaces
  useEffect(()=>{
    fetchWorkspaces().then(ws=>{
      setWorkspaces(ws);
      const initial = ws[0]?.id ?? "seed";
      setActiveWs(a=> a || initial);
    }).catch(()=> setWorkspaces([{id:"seed",kb:"seed",kbTildified:"~/seed",worklogs:"",worklogsTildified:"",noteCount:0,indexFresh:null} as any]));
  },[]);
  // persist tabs per workspace
  useEffect(()=>{
    if(!activeWs) return;
    localStorage.setItem(`tabs:${activeWs}`, JSON.stringify(tabs));
  },[tabs, activeWs]);
  useEffect(()=>{
    // load tabs for workspace if switched
    if(!activeWs) return;
    try{
      const raw = localStorage.getItem(`tabs:${activeWs}`);
      if(raw){ const t = JSON.parse(raw); if(Array.isArray(t)&&t.length){ setTabs(t); setActivePath(t[0].path);} }
    }catch{}
  },[activeWs]);

  // load tree
  useEffect(()=>{
    if(!activeWs) return;
    fetchTree(activeWs).then(d=>{ setTree(d.kbTree); setWorklogs(d.worklogs); setNoteCount(d.noteCount); }).catch(()=>{});
    // reset graph cache
    setGraph(null);
  },[activeWs]);

  // load note or worklog when active changes
  useEffect(()=>{
    if(!activeWs || !activePath) return;
    const isWorklog = activePath.startsWith("_Worklogs/") || activePath.endsWith("STATE.md") && worklogs.some((w:any)=> activePath.includes(w.slug));
    // Simpler: if path is in worklogs tree, treat as worklog
    const isWorklogPath = activePath.includes("STATE.md") || /^\d{4}-\d{2}-\d{2}\.md$/.test(activePath.split("/").pop() ?? "") && worklogs.length>0 && activePath.includes("_");
    // Heuristic: if activePath contains worklog slug, load worklog view; else note
    // We store worklog tabs as path like "_Worklogs/_root/STATE.md" but our tree worklogs are separate; easier: detect via worklogSlug state
    // For now, if mode is note and path looks like worklog, switch to worklog data fetch
    if(activePath.startsWith("_Worklogs/") || (worklogs.find((w:any)=> activePath.includes(w.slug)) && (activePath.includes("STATE") || /20\d\d/.test(activePath)))){
      // worklog view: extract slug
      const slugMatch = activePath.match(/_Worklogs\/([^/]+)/) ?? [null, worklogSlug];
      const slug = (slugMatch?.[1] as string) ?? worklogSlug;
      setWorklogSlug(slug);
      fetchWorklog(activeWs, slug).then(setWorklog).catch(()=>{});
      setNote(null);
      return;
    }
    fetchNote(activeWs, activePath).then(n=>{ setNote(n); setWorklog(null); }).catch(()=> setNote(null));
    // also refresh graph focused
    if(mode==="graph"){
      fetchGraph(activeWs, activePath, graphDepth, graphFull).then(setGraph).catch(()=>{});
    }
  },[activeWs, activePath, worklogs]);

  // palette search
  useEffect(()=>{
    if(!paletteOpen) return;
    if(!activeWs) return;
    const q = paletteQ.trim();
    // palette supports filter syntax? we use chips separately; for now just q
    const t = setTimeout(()=>{
      fetchSearch(activeWs, q, {type:filterType, tag:filterTag}).then(r=> setHits(r.hits)).catch(()=>{});
    },150);
    return ()=> clearTimeout(t);
  },[paletteQ, paletteOpen, activeWs, filterType, filterTag]);

  // keyboard palette
  useEffect(()=>{
    const onKey = (e:KeyboardEvent)=>{
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setPaletteOpen(o=>!o); }
      if(e.key==="Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return ()=> window.removeEventListener("keydown", onKey);
  },[]);

  function openPath(path:string, newTab=false){
    // determine if worklog path? keep as note tab for now but handle
    // add tab if not exists
    setTabs(prev=>{
      const exists = prev.find(t=>t.path===path);
      if(exists) return prev;
      const title = path.split("/").pop()?.replace(/\.md$/,"") ?? path;
      const isWorklog = path.includes("STATE.md") || path.includes("_Worklogs");
      const next = newTab ? [...prev, {path, title, type: isWorklog?"worklog":"note" as any}] : [...prev.slice(0, -1), ...prev.slice(-1), {path, title, type: isWorklog?"worklog":"note" as any}];
      // if not newTab and single click, replace last? simpler: just add if not exists and focus
      if(!exists){
        return [...prev, {path, title, type: isWorklog?"worklog":"note" as any}];
      }
      return prev;
    });
    setActivePath(path);
    setMode("note");
  }
  function closeTab(path:string, e?:React.MouseEvent){
    e?.stopPropagation();
    setTabs(prev=>{
      const idx = prev.findIndex(t=>t.path===path);
      const next = prev.filter(t=>t.path!==path);
      if(next.length===0) return [{path:"auth/jwt.md", title:"JWT Handling", type:"note"}];
      if(activePath===path){
        const newActive = next[Math.max(0, idx-1)]!;
        setActivePath(newActive.path);
      }
      return next;
    });
  }
  function handleWikilink(target:string, newTab:boolean){
    // resolve target to path: try exact relPath, title, or with .md
    // For v1, request search for target title and open best hit
    fetchSearch(activeWs, target, {}).then(r=>{
      const hit = r.hits[0];
      if(hit) openPath(hit.path, newTab);
      else {
        // fallback: try target as path.md
        const guess = target.endsWith(".md") ? target : target + ".md";
        openPath(guess, newTab);
      }
    }).catch(()=>{
      const guess = target.endsWith(".md") ? target : target + ".md";
      openPath(guess, newTab);
    });
  }

  useEffect(()=>{
    if(mode==="graph" && activePath){
      fetchGraph(activeWs, activePath, graphDepth, graphFull).then(setGraph).catch(()=>{});
    }
  },[mode, graphDepth, graphFull, activePath, activeWs]);

  const wsMeta = workspaces.find(w=>w.id===activeWs);

  return <div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
    <div className="top">
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <select value={activeWs} onChange={e=>setActiveWs(e.target.value)} className="vault-badge" style={{border:0,background:"var(--ink)",color:"var(--bg)"}}>
          {workspaces.map(w=> <option key={w.id} value={w.id}>◈ {w.id}</option>)}
        </select>
        <span className="muted mono" style={{fontSize:11}}>{wsMeta?.kbTildified ?? ""}</span>
      </div>
      <div className="search-box" onClick={()=>setPaletteOpen(true)}>⌕ Search {noteCount} notes… <kbd>⌘K</kbd></div>
      <div className="top-right">
        <button className="btn" onClick={()=> setMode(m=> m==="note"?"graph":"note")}>{mode==="note"?"⬡ Graph":"≡ Notes"}</button>
        <span className="dot" title="index fresh"></span> <span style={{fontSize:11}}>fresh</span>
        <button className="btn" onClick={toggle} title="Toggle theme">{theme==="light"?"◐ Dark":"☀ Light"}</button>
      </div>
    </div>

    <div className="shell">
      <aside className="left">
        <div className="left-head">◆ Explorer</div>
        <div className="tree">
          <div className="group">
            <div className="group-title">KB <i></i></div>
            {tree.length ? <TreeView nodes={tree} activePath={activePath} onOpen={openPath} expanded={expanded} toggle={(p)=> setExpanded(s=>{const n=new Set(s); if(n.has(p)) n.delete(p); else n.add(p); return n;})} /> : <div className="muted" style={{padding:"8px 10px",fontSize:13}}>No notes — check vault path.</div>}
          </div>
          <div className="group">
            <div className="group-title">Worklogs <i></i></div>
            {worklogs.length ? worklogs.map((w:any)=>
              <div key={w.slug}>
                <div className="row" onClick={()=>{ setWorklogSlug(w.slug); fetchWorklog(activeWs,w.slug).then(setWorklog); setMode("note"); // worklog shows in main as timeline
                  const p = `_Worklogs/${w.slug}/STATE.md`; openPath(p); }}><span className="ic">▾</span> {w.slug} <span className="count">{w.dates.length + (w.stateExists?1:0)}</span></div>
                <div className="row indent" onClick={()=>{ const p=`_Worklogs/${w.slug}/STATE.md`; openPath(p);}}><span className="ic">◆</span> STATE.md</div>
                {w.dates.slice(0,6).map((d:string)=> <div key={d} className="row indent" onClick={()=>{ const p=`_Worklogs/${w.slug}/${d}.md`; openPath(p);}}><span className="ic">≡</span> {d}.md</div>)}
              </div>
            ) : <div className="muted" style={{padding:"8px 10px",fontSize:13}}>No worklogs.</div>}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="tabs">
          {tabs.map(t=>{
            const active = t.path===activePath;
            return <div key={t.path} className={`tab ${active?"active":""}`} onClick={()=>{ setActivePath(t.path); if(t.type==="worklog") setMode("note");}}>
              <span>{t.type==="worklog"?"◆":"≡"}</span> {t.title} <span className="x" onClick={(e)=>closeTab(t.path,e)}>×</span>
            </div>;
          })}
        </div>
        <div className="content">
          {mode==="graph" ? <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span className="mono" style={{fontSize:12,color:"var(--muted)"}}>Focused: {activePath} · Depth</span>
              <button className="btn" onClick={()=> setGraphDepth(d=> d===1?2:1 as any)}> {graphDepth}</button>
              <button className="btn" onClick={()=> setGraphFull(f=>!f)}>{graphFull?"Focused":"Full vault"}</button>
              <span className="muted mono" style={{marginLeft:"auto",fontSize:11}}>{graph?.nodes.length ?? 0} nodes · {graph?.edges.length ?? 0} edges</span>
            </div>
            <GraphView graph={graph} activePath={activePath} onNodeClick={openPath} />
          </> : worklog ? <>
            <div className="breadcrumb">_Worklogs <span style={{opacity:.4}}>/</span> <b>{worklogSlug}</b> <span className="muted" style={{marginLeft:8}}>{worklog.slugs.join(" · ")}</span></div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <select value={worklogSlug} onChange={e=>{ const s=e.target.value; setWorklogSlug(s); fetchWorklog(activeWs,s).then(setWorklog); }} className="btn"> {worklog.slugs?.map((s:string)=> <option key={s} value={s}>{s}</option>)} </select>
              <span className="muted mono" style={{fontSize:12,alignSelf:"center"}}>{worklog.entries.length} entries</span>
            </div>
            {worklog.state && <div className="worklog-card pinned"><h3>◆ STATE.md — pinned</h3><div className="body"><NoteView note={{...note!, body: worklog.state, title:"STATE", type:"state", importance:null, tags:"", epic:"", rels:[], outgoing:[], backlinks:[], headings:[], frontmatter:{}, path:`_Worklogs/${worklogSlug}/STATE.md`} as any} workspace={activeWs} onWikilink={handleWikilink} /></div></div>}
            {worklog.entries.map(en=> <div key={en.date} id={en.date} className="worklog-card"><h3>{en.date}</h3><div className="body"><NoteView note={{...note!, body: en.body, title: en.date, type:"journal", importance:null, tags:"", epic:"", rels:[], outgoing:[], backlinks:[], headings:[], frontmatter:{}, path:`_Worklogs/${worklogSlug}/${en.date}.md`} as any} workspace={activeWs} onWikilink={handleWikilink} /></div></div>)}
            {!worklog.state && worklog.entries.length===0 && <div className="muted">No entries for {worklogSlug}</div>}
          </> : note ? <>
            <div className="breadcrumb">{note.path.split("/").slice(0,-1).join(" / ") || "vault"} <span style={{opacity:.4}}> / </span> <b>{note.title}</b></div>
            <div className="title">{note.title}</div>
            <div className="stamps">
              <span className="stamp"><b>type</b> {note.type}</span>
              {note.importance!==null && <span className={`stamp ${note.importance>=8?"imp":""}`}><b>imp</b> {note.importance}</span>}
              {note.tags && <span className="stamp"><b>tags</b> {note.tags}</span>}
              {note.epic && <span className="stamp"><b>epic</b> {note.epic}</span>}
            </div>
            {note.body.includes("[!NOTE]") || note.body.includes("[!WARNING]") ? null : null}
            <NoteView note={note} workspace={activeWs} onWikilink={handleWikilink} />
          </> : <div className="muted mono" style={{padding:24}}>Select a note or press ⌘K to search.</div>}
        </div>
      </main>

      <aside className="right">
        {mode==="graph" ? <>
          <div className="block"><h3>Filters</h3>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              <button className="btn" onClick={()=>setFilterType(v=> v?"":"spec")}>type:spec {filterType==="spec"?"●":""}</button>
              <button className="btn" onClick={()=>setFilterTag(v=> v?"":"auth")}>tag:auth {filterTag==="auth"?"●":""}</button>
            </div>
            <p className="muted mono" style={{fontSize:11,marginTop:8}}>Graph filters apply to search too. Full vault capped at 500.</p>
          </div>
          <div className="block"><h3>Legend</h3><div className="muted mono" style={{fontSize:12,lineHeight:1.7}}>— grey = links_to<br/><span style={{color:"var(--teal)"}}>— teal = typed (depends_on)</span></div></div>
        </> : worklog ? <>
          <div className="block"><h3>Date jump</h3>
            {worklog.entries.map(en=> <div key={en.date} className="link" onClick={()=> document.getElementById(en.date)?.scrollIntoView({behavior:"smooth"})}><b>{en.date}</b><small>{en.body.slice(0,60).replace(/\s+/g," ")}…</small></div>)}
          </div>
        </> : note ? <>
          <div className="block"><h3>Outgoing · {note.outgoing.length}</h3>
            <div className="links">{note.outgoing.length ? note.outgoing.map((r,i)=><div key={i} className="link" onClick={()=>handleWikilink(r.target,false)}><b>{r.target}</b><small>{r.relationType} · {r.target}</small></div>) : <div className="muted" style={{fontSize:13}}>No outgoing links.</div>}</div>
          </div>
          <div className="block"><h3>Backlinks · {note.backlinks.length}</h3>
            <div className="links">{note.backlinks.length ? note.backlinks.map(b=> <div key={b.path} className="link" onClick={()=>openPath(b.path)}><b>{b.title}</b><small>{b.snippet}</small></div>) : <div className="muted" style={{fontSize:13}}>No backlinks.</div>}</div>
          </div>
          <div className="block"><h3>Tags</h3>{note.tags ? note.tags.split(" ").map(t=> <span key={t} className="tag">#{t}</span>) : <span className="muted" style={{fontSize:13}}>No tags.</span>}</div>
          <div className="block"><h3>Outline</h3><div className="outline">{note.headings.length ? note.headings.map(h=> <div key={h.slug} style={{paddingLeft: (h.level-1)*10}}><a href={`#${h.slug}`}>{h.text}</a></div>) : <div className="muted">No headings.</div>}</div></div>
        </> : <div className="muted" style={{padding:12,fontSize:13}}>Select a note.</div>}
      </aside>
    </div>

    <div className="status">
      <span>{noteCount} notes</span><span>index fresh</span><span style={{marginLeft:"auto"}}>vault: {wsMeta?.kbTildified ?? ""}</span><button className="btn" style={{height:18,padding:"0 8px",fontSize:11}} onClick={async()=>{ await postReindex(activeWs); const d=await fetchTree(activeWs); setTree(d.kbTree); setWorklogs(d.worklogs); setNoteCount(d.noteCount); }}>Reindex</button>
    </div>

    {paletteOpen && <div className="palette" onClick={()=> setPaletteOpen(false)}>
      <div className="palette-card" onClick={e=> e.stopPropagation()}>
        <div className="palette-input"><span>⌕</span><input autoFocus placeholder="Search notes… (title×10 tags×5 body×1)" value={paletteQ} onChange={e=> setPaletteQ(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && hits[0]){ openPath(hits[0].path); setPaletteOpen(false); }}} /><kbd>ESC</kbd></div>
        <div style={{padding:"6px 14px",display:"flex",gap:6,borderBottom:"1px solid var(--line)"}}>
          <button className="btn" onClick={()=> setFilterType(v=> v?"":"spec")}>type:spec</button>
          <button className="btn" onClick={()=> setFilterTag(v=> v?"":"auth")}>tag:auth</button>
          <span className="muted mono" style={{marginLeft:"auto",fontSize:11}}>{hits.length} hits</span>
        </div>
        <div className="palette-results">
          {hits.length ? hits.map(h=> <div key={h.path} className="hit" onClick={()=>{ openPath(h.path); setPaletteOpen(false);}}><b>{h.title} <span className="muted" style={{fontWeight:400,marginLeft:6}}>{h.type}</span></b><small>{h.snippet} · <span style={{color:"var(--muted)"}}>{h.path}</span></small></div>) : <div className="muted mono" style={{padding:"16px 12px",fontSize:13}}>{paletteQ ? "No hits — try another term." : "Type to search. Try 'jwt', 'auth', 'search'."}</div>}
        </div>
      </div>
    </div>}
  </div>;
}
