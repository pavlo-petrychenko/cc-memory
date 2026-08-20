import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { loadRegistry, tildifyPath } from "./registry.js";
import { loadAllNotes, buildKbTree, scanWorklogs, readWorklogEntries, readNoteFile } from "./vault.js";
import { searchNotes } from "./search.js";
import { parseNote } from "./parser.js";

const PORT = Number(process.env.API_PORT ?? 3414);
const app = express();
app.use(cors());
app.use(express.json());

function getWorkspace(id: string){
  const regs = loadRegistry();
  const ws = regs.find(w=>w.id===id) ?? regs[0]!;
  return ws;
}

// simple in-memory cache with mtime check
let cache: Record<string, {mtime:number, notes: any, tree:any}> = {};

function getNotesCached(wsId: string){
  const ws = getWorkspace(wsId);
  const notes = loadAllNotes(ws.kb, ws.exclude);
  const tree = buildKbTree(notes);
  const worklogs = scanWorklogs(ws.worklogs);
  return { ws, notes, tree, worklogs };
}

app.get("/api/workspaces", (_req,res)=>{
  const regs = loadRegistry();
  const out = regs.map(w=>{
    const notes = loadAllNotes(w.kb, w.exclude);
    let mtime = 0;
    for(const n of notes) mtime = Math.max(mtime, n.mtimeMs);
    return { id:w.id, kb:w.kb, kbTildified: tildifyPath(w.kb), worklogs:w.worklogs, worklogsTildified: tildifyPath(w.worklogs), noteCount: notes.length, indexFresh: mtime ? new Date(mtime).toISOString() : null, exclude: w.exclude };
  });
  res.json(out);
});

app.get("/api/tree", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const { ws, notes, tree, worklogs } = getNotesCached(wsId);
  res.json({ workspace: ws.id, kb: ws.kb, kbTree: tree, worklogs, noteCount: notes.length });
});

app.get("/api/note", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const rel = String(req.query.path ?? "");
  if(!rel) return res.status(400).json({error:"path required"});
  const ws = getWorkspace(wsId);
  // sandbox check
  const abs = path.join(ws.kb, rel);
  const resolved = path.resolve(abs);
  const kbResolved = path.resolve(ws.kb);
  if(!resolved.startsWith(kbResolved)) return res.status(403).json({error:"outside vault"});
  if(!fs.existsSync(resolved)) return res.status(404).json({error:"not found"});
  const text = fs.readFileSync(resolved,"utf-8");
  const base = path.basename(resolved);
  const fallback = base.endsWith(".md") ? base.slice(0,-3) : base;
  const parsed = parseNote(text, fallback);
  // compute backlinks/outgoing across all notes
  const all = loadAllNotes(ws.kb, ws.exclude);
  const outgoing = parsed.rels;
  const backlinks: {path:string, title:string, snippet:string}[] = [];
  for(const n of all){
    if(n.relPath===rel) continue;
    for(const r of n.rels){
      if(r.target===parsed.title || r.target===rel.replace(/\.md$/,"") || r.target===rel){
        backlinks.push({path:n.relPath, title:n.title, snippet: n.body.slice(0,160).replace(/\s+/g," ").trim()});
        break;
      }
      // also wikilink target could be title without path
      if(n.body.includes(`[[${parsed.title}`) || n.body.includes(`[[${rel}`)){
        // already captured? skip dup
      }
    }
  }
  // headings for outline
  const headings: {level:number, text:string, slug:string}[] = [];
  for(const m of parsed.body.matchAll(/^(#{1,6})\s+(.+)$/gm)){
    const level = m[1]!.length;
    const text2 = m[2]!.trim();
    const slug = text2.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    headings.push({level, text:text2, slug});
  }
  res.json({ path: rel, ...parsed, outgoing, backlinks, headings, frontmatter: Object.fromEntries(parsed.frontmatter) });
});

app.get("/api/file", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const rel = String(req.query.path ?? "");
  const ws = getWorkspace(wsId);
  // try kb then worklogs then relative to note dir fallback
  const candidates = [path.join(ws.kb, rel), path.join(ws.worklogs, rel)];
  // also try absolute vault-relative already normalized
  let found: string | null = null;
  for(const c of candidates){
    if(fs.existsSync(c) && fs.statSync(c).isFile()){ found = c; break; }
  }
  // also try resolving relative to kb dir without leading slash
  if(!found){
    const abs = path.resolve(path.join(ws.kb, rel));
    if(abs.startsWith(path.resolve(ws.kb)) && fs.existsSync(abs)) found = abs;
  }
  if(!found) return res.status(404).send("not found");
  res.sendFile(found);
});

app.get("/api/search", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const q = String(req.query.q ?? "");
  const type = req.query.type ? String(req.query.type) : undefined;
  const tag = req.query.tag ? String(req.query.tag) : undefined;
  const feature = req.query.feature ? String(req.query.feature) : undefined;
  const ws = getWorkspace(wsId);
  const notes = loadAllNotes(ws.kb, ws.exclude);
  const hits = searchNotes(notes as any, q, {type, tag, feature}, 30);
  res.json({ query:q, hits });
});

app.get("/api/graph", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const focus = req.query.focus ? String(req.query.focus) : null;
  const depth = Number(req.query.depth ?? 1);
  const full = String(req.query.full ?? "0") === "1";
  const ws = getWorkspace(wsId);
  const notes = loadAllNotes(ws.kb, ws.exclude);
  const nodes = notes.map(n=>({ id: n.relPath, title: n.title, type: n.type, importance: n.importance, tags: n.tags }));
  const edges: {source:string,target:string, relationType:string}[] = [];
  const pathByTitle = new Map<string,string>();
  for(const n of notes) pathByTitle.set(n.title, n.relPath);
  for(const n of notes){
    for(const r of n.rels){
      let targetPath = r.target;
      // resolve target: if title matches, use path, else if relPath matches
      if(pathByTitle.has(r.target)) targetPath = pathByTitle.get(r.target)!;
      else if(!r.target.endsWith(".md")){
        // try with .md
        const maybe = r.target + ".md";
        const found = notes.find(x=>x.relPath===maybe || x.relPath.endsWith("/"+maybe));
        if(found) targetPath = found.relPath;
      }
      // only keep edges where target exists
      if(notes.find(x=>x.relPath===targetPath)){
        edges.push({ source: n.relPath, target: targetPath, relationType: r.relationType });
      }
    }
  }
  if(!full && focus){
    // BFS 1-2 hops
    const keep = new Set<string>([focus]);
    let frontier = new Set([focus]);
    for(let d=0; d<depth; d++){
      const next = new Set<string>();
      for(const e of edges){
        if(frontier.has(e.source) && !keep.has(e.target)){ keep.add(e.target); next.add(e.target); }
        if(frontier.has(e.target) && !keep.has(e.source)){ keep.add(e.source); next.add(e.source); }
      }
      frontier = next;
    }
    const filteredNodes = nodes.filter(n=>keep.has(n.id));
    const filteredEdges = edges.filter(e=>keep.has(e.source) && keep.has(e.target));
    return res.json({ nodes: filteredNodes, edges: filteredEdges, mode: "focused", focus });
  }
  // cap full at 500
  const cappedNodes = nodes.slice(0,500);
  const cappedEdges = edges.filter(e=> cappedNodes.find(n=>n.id===e.source) && cappedNodes.find(n=>n.id===e.target)).slice(0,1000);
  res.json({ nodes: cappedNodes, edges: cappedEdges, mode:"full" });
});

app.get("/api/worklog", (req,res)=>{
  const wsId = String(req.query.workspace ?? "");
  const slug = String(req.query.slug ?? "_root");
  const ws = getWorkspace(wsId);
  const data = readWorklogEntries(ws.worklogs, slug);
  const slugs = scanWorklogs(ws.worklogs);
  res.json({ slug, state: data.state, entries: data.entries, slugs: slugs.map(s=>s.slug) });
});

app.post("/api/reindex", (req,res)=>{
  const wsId = String(req.query.workspace ?? String(req.body?.workspace ?? ""));
  const ws = getWorkspace(wsId || loadRegistry()[0]!.id);
  const notes = loadAllNotes(ws.kb, ws.exclude);
  // no real index db, just recount
  res.json({ added: notes.length, updated: 0, removed: 0, total: notes.length, message:"in-memory reindex (no sqlite in v1)" });
});

// static seed fallback for /api/file assets that are missing — return placeholder
app.use((err:any,_req:any,res:any,_next:any)=>{
  console.error(err);
  res.status(500).json({error:"internal", details: String(err?.message ?? err)});
});

app.listen(PORT, ()=> console.log(`[api] listening on http://localhost:${PORT}`));
