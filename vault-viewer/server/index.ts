import express from "express";
import cors from "cors";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { loadWorkspaces } from "./registry";
import { walkKb, buildKbTree, scanWorklogs, searchNotes } from "./vault";
import { parseNote } from "./parser";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.API_PORT ?? 3416);

let workspacesCache: Awaited<ReturnType<typeof loadWorkspaces>> | null = null;
async function getWorkspaces() {
  if (!workspacesCache) workspacesCache = await loadWorkspaces();
  return workspacesCache;
}

// GET /api/workspaces
app.get("/api/workspaces", async (_req, res) => {
  const { workspaces, source } = await getWorkspaces();
  const enriched = await Promise.all(workspaces.map(async w=>{
    const notes = await walkKb(w.kb, w.exclude);
    let indexFresh = "seed";
    try {
      const st = await stat(w.indexDb);
      const ageMin = Math.round((Date.now() - st.mtimeMs)/60000);
      indexFresh = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin/60)}h ago`;
    } catch {}
    if (source==="seed-fallback") indexFresh = "seed";
    return {
      id: w.id,
      kb: w.kb,
      worklogs: w.worklogs,
      tildifiedKb: w.tildifiedKb,
      exclude: w.exclude,
      noteCount: notes.length,
      indexFresh,
      source,
    };
  }));
  res.json({ workspaces: enriched, source });
});

// GET /api/tree?workspace=ID
app.get("/api/tree", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.status(404).json({ error: "no workspace" });
  const notes = await walkKb(ws.kb, ws.exclude);
  const kbTree = buildKbTree(notes);
  const worklogs = await scanWorklogs(ws.worklogs);
  res.json({ kbTree, worklogs, notes: notes.map(n=>({ relPath:n.relPath, title:n.title, type:n.type, importance:n.importance, tags:n.tags })) });
});

// GET /api/note?workspace=ID&path=rel/path.md
app.get("/api/note", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const relPath = String(req.query.path ?? "");
  if (!relPath) return res.status(400).json({ error: "path required" });
  // prevent traversal
  if (relPath.includes("..")) return res.status(400).json({ error: "invalid path" });
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.status(404).json({ error: "no workspace" });

  // try kb then worklogs
  const candidates = [join(ws.kb, relPath), join(ws.worklogs, relPath)];
  let abs: string | null = null;
  let isWorklog = false;
  for (let i=0;i<candidates.length;i++) {
    try { await stat(candidates[i]!); abs = candidates[i]!; isWorklog = i===1; break; } catch {}
  }
  // also try worklogs path directly if relPath starts with slug
  if (!abs) return res.status(404).json({ error: "not found" });
  const text = await readFile(abs, "utf8").catch(()=> "");
  const fallback = relPath.split("/").pop()?.replace(".md","") ?? relPath;
  const parsed = parseNote(text, fallback);

  // compute backlinks/outgoing via scanning all notes (kb only for backlinks)
  const notes = await walkKb(ws.kb, ws.exclude);
  const outgoing = parsed.rels;
  // backlinks: notes that link to this file's relPath without extension or title?
  // We match target against relPath (without .md) and title
  const relKey = relPath.replace(/\.md$/,"");
  const titleLower = parsed.title.toLowerCase();
  const backlinks: { relPath:string; title:string; snippet:string }[] = [];
  for (const n of notes) {
    if (n.relPath===relPath) continue;
    for (const r of n.rels) {
      const tgt = r.target.toLowerCase();
      if (tgt===relKey.toLowerCase() || tgt===titleLower || tgt===fallback.toLowerCase()) {
        // find snippet around wikilink
        const idx = n.body.toLowerCase().indexOf(`[[${r.target.toLowerCase()}`);
        let snippet = "";
        if (idx>=0) {
          const start = Math.max(0, idx-40);
          snippet = n.body.slice(start, idx+80).replace(/\s+/g," ").trim();
        } else snippet = n.body.slice(0,80).replace(/\s+/g," ");
        backlinks.push({ relPath: n.relPath, title: n.title, snippet });
        break;
      }
    }
  }

  res.json({
    relPath,
    ...parsed,
    backlinks: backlinks.slice(0,20),
    outgoing,
    isWorklog,
  });
});

// GET /api/file?workspace=ID&path=rel.png
app.get("/api/file", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const relPath = String(req.query.path ?? "");
  if (!relPath || relPath.includes("..")) return res.status(400).end();
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.status(404).end();
  const candidates = [join(ws.kb, relPath), join(ws.worklogs, relPath)];
  let abs: string | null = null;
  for (const c of candidates) {
    try { await stat(c); abs = c; break; } catch {}
  }
  if (!abs) return res.status(404).end();
  // sandbox check
  const resolved = resolve(abs);
  if (!resolved.startsWith(ws.kb) && !resolved.startsWith(ws.worklogs)) return res.status(403).end();
  const ext = extname(resolved).toLowerCase();
  const mimeMap: Record<string,string> = { ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".webp":"image/webp",".pdf":"application/pdf" };
  res.setHeader("Content-Type", mimeMap[ext] ?? "application/octet-stream");
  res.sendFile(resolved);
});

// GET /api/search?workspace=ID&q=...&type=&tag=&feature=
app.get("/api/search", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const q = String(req.query.q ?? "");
  const type = req.query.type ? String(req.query.type) : undefined;
  const tag = req.query.tag ? String(req.query.tag) : undefined;
  const feature = req.query.feature ? String(req.query.feature) : undefined;
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.json({ hits: [] });
  const notes = await walkKb(ws.kb, ws.exclude);
  const hits = searchNotes(notes, q, { type, tag, feature });
  res.json({
    hits: hits.map(h=>({
      relPath: h.note.relPath,
      title: h.note.title,
      type: h.note.type,
      importance: h.note.importance,
      tags: h.note.tags,
      snippet: h.note.body.slice(0,120).replace(/\s+/g," ").trim(),
      score: h.score,
    }))
  });
});

// GET /api/graph?workspace=ID&focus=...&depth=1&full=0
app.get("/api/graph", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const focus = req.query.focus ? String(req.query.focus) : null;
  const depth = Number(req.query.depth ?? 1);
  const full = req.query.full === "1";
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.json({ nodes:[], edges:[] });
  const notes = await walkKb(ws.kb, ws.exclude);
  const byRel = new Map(notes.map(n=>[n.relPath, n]));
  const byTitleLower = new Map(notes.map(n=>[n.title.toLowerCase(), n]));
  // Build all edges with resolution attempt
  const allEdges: { source:string; target:string; relationType:string }[] = [];
  for (const n of notes) {
    for (const r of n.rels) {
      let targetRel: string | null = null;
      // try relPath match
      const tryPaths = [
        `${r.target}.md`,
        `${r.target}`,
        // feature/name
      ];
      for (const tp of tryPaths) {
        if (byRel.has(tp)) { targetRel = tp; break; }
      }
      if (!targetRel) {
        const byTitle = byTitleLower.get(r.target.toLowerCase());
        if (byTitle) targetRel = byTitle.relPath;
      }
      if (targetRel) {
        allEdges.push({ source: n.relPath, target: targetRel, relationType: r.relationType });
      }
    }
  }
  let nodes: typeof notes = [];
  let edges = allEdges;
  if (full || !focus) {
    nodes = notes.slice(0,500);
    // filter edges to visible nodes
    const visible = new Set(nodes.map(n=>n.relPath));
    edges = allEdges.filter(e=>visible.has(e.source) && visible.has(e.target));
  } else {
    // BFS from focus
    const visited = new Set<string>();
    let frontier = new Set<string>([focus]);
    visited.add(focus);
    for (let d=0; d<depth; d++) {
      const next = new Set<string>();
      for (const e of allEdges) {
        if (frontier.has(e.source) && !visited.has(e.target)) { visited.add(e.target); next.add(e.target); }
        if (frontier.has(e.target) && !visited.has(e.source)) { visited.add(e.source); next.add(e.source); }
      }
      frontier = next;
      if (frontier.size===0) break;
    }
    nodes = notes.filter(n=>visited.has(n.relPath));
    const visible = new Set(nodes.map(n=>n.relPath));
    edges = allEdges.filter(e=>visible.has(e.source) && visible.has(e.target));
    // if isolated (no edges), just return focus + maybe neighbors via title?
    if (nodes.length===1) {
      // add up to 5 random to not show empty? keep single
    }
  }
  res.json({
    nodes: nodes.map(n=>({ id:n.relPath, title:n.title, type:n.type, importance:n.importance, tags:n.tags })),
    edges,
  });
});

// GET /api/worklog?workspace=ID&slug=_root
app.get("/api/worklog", async (req, res) => {
  const wid = String(req.query.workspace ?? "");
  const slug = String(req.query.slug ?? "_root");
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.status(404).json({ error:"no workspace"});
  const worklogs = await scanWorklogs(ws.worklogs);
  const found = worklogs.find(s=>s.slug===slug);
  if (!found) return res.status(404).json({ error:"slug not found", slugs: worklogs.map(s=>s.slug)});
  res.json(found);
});

// POST /api/reindex
app.post("/api/reindex", async (req, res) => {
  const wid = String(req.query.workspace ?? req.body?.workspace ?? "");
  const { workspaces } = await getWorkspaces();
  const ws = workspaces.find(w=>w.id===wid) ?? workspaces[0];
  if (!ws) return res.json({ added:0, updated:0, removed:0, total:0 });
  const notes = await walkKb(ws.kb, ws.exclude);
  workspacesCache = null; // bust
  res.json({ added: notes.length, updated:0, removed:0, total: notes.length });
});

app.listen(PORT, ()=> {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
