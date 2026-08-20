import { Router } from "express";
import { existsSync, statSync, readFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { loadWorkspaces, tildify } from "../services/registry.service.js";
import { listAllNotes, getNoteDetail, scanKbTree, scanWorklogs, getWorklogFile } from "../services/vault.service.js";
import { parseNote } from "../services/noteParser.js";

const FALLBACK_KB = resolve("vault-viewer/seed-vault");
const FALLBACK_WORKLOGS = resolve("vault-viewer/seed-vault/_Worklogs");

function resolveWs(id: string | undefined) {
  const all = loadWorkspaces();
  if (all.length === 0) {
    return {
      id: "seed",
      kb: FALLBACK_KB,
      worklogs: FALLBACK_WORKLOGS,
      exclude: [] as string[],
      indexDb: "",
      match: [] as string[],
      kbAbs: FALLBACK_KB,
      worklogsAbs: FALLBACK_WORKLOGS,
    };
  }
  if (!id) return all[0]!;
  return all.find((w) => w.id === id) ?? all[0]!;
}

export const api = Router();

api.get("/workspaces", (_req, res) => {
  const all = loadWorkspaces();
  if (all.length === 0) {
    const kbAbs = FALLBACK_KB;
    const count = existsSync(kbAbs) ? listAllNotes({ kbAbs, worklogsAbs: FALLBACK_WORKLOGS, id: "seed", kb: kbAbs, worklogs: FALLBACK_WORKLOGS, exclude: [], indexDb: "", match: [] }).length : 0;
    res.json([{ id: "seed", kb: tildify(kbAbs), worklogs: tildify(FALLBACK_WORKLOGS), noteCount: count, indexFresh: new Date().toISOString(), kbAbs, worklogsAbs: FALLBACK_WORKLOGS }]);
    return;
  }
  const out = all.map((w) => {
    let count = 0;
    try { count = listAllNotes(w).length; } catch {}
    let fresh: string | null = null;
    try {
      if (w.indexDb && existsSync(w.kbAbs.replace(/^~.*/, w.kbAbs))) {} // placeholder
      fresh = new Date(statSync(w.kbAbs).mtimeMs).toISOString();
    } catch { fresh = new Date().toISOString(); }
    return { id: w.id, kb: tildify(w.kbAbs), worklogs: tildify(w.worklogsAbs), noteCount: count, indexFresh: fresh, kbAbs: w.kbAbs, worklogsAbs: w.worklogsAbs, match: w.match };
  });
  res.json(out);
});

api.get("/tree", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const kbTree = scanKbTree(ws);
  const worklogsTree = scanWorklogs(ws).map((s) => ({
    slug: s.slug,
    state: s.statePath,
    entries: s.entries.map((e) => e.path),
  }));
  res.json({ kbTree, worklogsTree });
});

api.get("/note", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const rel = (req.query.path as string) ?? "";
  if (!rel) { res.status(400).json({ error: "path required" }); return; }
  // try KB first then worklogs
  let detail = getNoteDetail(ws, rel);
  let bodyText: string | null = null;
  if (detail) bodyText = detail.rawText;
  else {
    const wl = getWorklogFile(ws, rel);
    if (wl != null) {
      const parsed = parseNote(wl, rel.split("/").pop()?.replace(".md", "") ?? "");
      res.json({ relPath: rel, title: parsed.title || rel, type: parsed.type, importance: parsed.importance, tags: parsed.tags, epic: parsed.epic, body: parsed.body, rawText: wl, rels: parsed.rels, backlinks: [], outgoing: parsed.rels });
      return;
    }
  }
  if (!detail) { res.status(404).json({ error: "not found" }); return; }
  // backlinks/outgoing
  const all = listAllNotes(ws);
  const outgoing = detail.rels;
  const backlinks: { path: string; title: string; snippet: string }[] = [];
  for (const n of all) {
    if (n.relPath === rel) continue;
    try {
      const txt = readFileSync(n.absPath, "utf-8");
      const p = parseNote(txt, n.relPath);
      for (const r of p.rels) {
        const targetLower = r.target.toLowerCase();
        const relLower = rel.toLowerCase();
        const titleLower = detail.title.toLowerCase();
        if (targetLower === relLower || targetLower === detail.title.toLowerCase() || relLower.includes(targetLower) || titleLower === targetLower) {
          const snippet = txt.slice(0, 200).replace(/\n/g, " ");
          backlinks.push({ path: n.relPath, title: p.title, snippet });
          break;
        }
      }
    } catch {}
  }
  res.json({ relPath: rel, title: detail.title, type: detail.type, importance: detail.importance, tags: detail.tags, epic: detail.epic, body: detail.body, rawText: bodyText, rels: detail.rels, backlinks, outgoing });
});

api.get("/file", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const rel = (req.query.path as string) ?? "";
  const candidates = [join(ws.kbAbs, rel), join(ws.worklogsAbs, rel)];
  // also try relative to note dir? client passes already resolved
  for (const abs of candidates) {
    const resolved = resolve(abs);
    if (!resolved.startsWith(resolve(ws.kbAbs)) && !resolved.startsWith(resolve(ws.worklogsAbs)) && !resolved.startsWith(FALLBACK_KB)) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      const ext = extname(resolved).toLowerCase();
      const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".pdf": "application/pdf" };
      if (mime[ext]) res.type(mime[ext]);
      res.sendFile(resolved);
      return;
    }
  }
  // fallback to seed
  const seedAbs = resolve(join(FALLBACK_KB, rel));
  if (existsSync(seedAbs)) { res.sendFile(seedAbs); return; }
  res.status(404).json({ error: "file not found" });
});

api.get("/search", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const q = ((req.query.q as string) ?? "").trim().toLowerCase();
  const typeFilter = (req.query.type as string) ?? "";
  const tagFilter = (req.query.tag as string) ?? "";
  const featureFilter = (req.query.feature as string) ?? "";
  const all = listAllNotes(ws);
  if (!q && !typeFilter && !tagFilter && !featureFilter) { res.json([]); return; }
  const hits: { path: string; title: string; type: string; snippet: string; score: number }[] = [];
  const qTokens = q ? q.split(/\s+/).filter(Boolean) : [];
  for (const n of all) {
    try {
      const txt = readFileSync(n.absPath, "utf-8");
      const p = parseNote(txt, n.relPath);
      if (typeFilter && p.type !== typeFilter) continue;
      if (tagFilter && !p.tags.includes(tagFilter)) continue;
      if (featureFilter && !n.relPath.startsWith(featureFilter + "/")) continue;
      let score = 0;
      if (qTokens.length === 0) score = 1;
      else {
        for (const t of qTokens) {
          if (p.title.toLowerCase().includes(t)) score += 10;
          if (p.tags.join(" ").toLowerCase().includes(t)) score += 5;
          if (p.body.toLowerCase().includes(t)) score += 1;
        }
      }
      if (score === 0) continue;
      const snippet = p.body.slice(0, 180).replace(/\n/g, " ").trim();
      hits.push({ path: n.relPath, title: p.title, type: p.type, snippet, score });
    } catch {}
  }
  hits.sort((a, b) => b.score - a.score);
  res.json(hits.slice(0, 50));
});

api.get("/graph", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const focus = (req.query.focus as string) ?? "";
  const depth = Number.parseInt((req.query.depth as string) ?? "1", 10);
  const full = (req.query.full as string) === "1";
  const all = listAllNotes(ws);
  const nodes = all.map((n) => {
    try {
      const txt = readFileSync(n.absPath, "utf-8");
      const p = parseNote(txt, n.relPath);
      return { id: n.relPath, title: p.title, type: p.type, tags: p.tags };
    } catch { return { id: n.relPath, title: n.relPath, type: "note", tags: [] as string[] }; }
  });
  const edges: { from: string; to: string; type: string }[] = [];
  const titleToPath = new Map<string, string>();
  const pathSet = new Set(all.map((n) => n.relPath));
  for (const n of nodes) titleToPath.set(n.title.toLowerCase(), n.id);
  for (const n of all) {
    try {
      const txt = readFileSync(n.absPath, "utf-8");
      const p = parseNote(txt, n.relPath);
      for (const r of p.rels) {
        const t = r.target.toLowerCase();
        let targetPath: string | undefined;
        if (pathSet.has(r.target)) targetPath = r.target;
        else if (titleToPath.has(t)) targetPath = titleToPath.get(t)!;
        else {
          // try contains
          for (const cand of all) if (cand.relPath.toLowerCase().includes(t) || t.includes(cand.relPath.toLowerCase().replace(".md", ""))) { targetPath = cand.relPath; break; }
        }
        if (targetPath) edges.push({ from: n.relPath, to: targetPath, type: r.relationType });
      }
    } catch {}
  }
  if (!full && focus) {
    const hop = new Set<string>([focus]);
    let frontier = new Set<string>([focus]);
    for (let i = 0; i < depth; i++) {
      const next = new Set<string>();
      for (const e of edges) {
        if (frontier.has(e.from) && !hop.has(e.to)) { hop.add(e.to); next.add(e.to); }
        if (frontier.has(e.to) && !hop.has(e.from)) { hop.add(e.from); next.add(e.from); }
      }
      frontier = next;
    }
    const filteredNodes = nodes.filter((n) => hop.has(n.id));
    const filteredEdges = edges.filter((e) => hop.has(e.from) && hop.has(e.to));
    res.json({ nodes: filteredNodes, edges: filteredEdges });
    return;
  }
  // cap full
  const cappedNodes = nodes.slice(0, 500);
  const cappedIds = new Set(cappedNodes.map((n) => n.id));
  const cappedEdges = edges.filter((e) => cappedIds.has(e.from) && cappedIds.has(e.to));
  res.json({ nodes: cappedNodes, edges: cappedEdges });
});

api.get("/worklog", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const slug = (req.query.slug as string) ?? "_root";
  const wlList = scanWorklogs(ws).find((s) => s.slug === slug);
  if (!wlList) { res.status(404).json({ error: "slug not found" }); return; }
  const stateBody = wlList.statePath ? getWorklogFile(ws, wlList.statePath) : null;
  res.json({ slug, stateBody, statePath: wlList.statePath, entries: wlList.entries });
});

api.post("/reindex", (req, res) => {
  const ws = resolveWs(req.query.workspace as string | undefined);
  const count = listAllNotes(ws).length;
  res.json({ added: 0, updated: count, removed: 0, total: count });
});
