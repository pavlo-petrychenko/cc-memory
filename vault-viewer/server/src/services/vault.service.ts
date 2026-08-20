import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename, relative, resolve } from "node:path";
import { parseNote } from "./noteParser.js";
import type { ResolvedWorkspace, TreeNode, WorklogSlug } from "../types.js";

function isExcludedDir(rel: string, exclude: string[]): boolean {
  const segs = rel.split("/").filter(Boolean);
  if (segs.some((s) => s.startsWith("."))) return true;
  for (const ex of exclude) {
    const t = ex.replace(/^\/+|\/+$/g, "");
    if (rel === t || rel.startsWith(t + "/")) return true;
  }
  return false;
}

export function scanKbTree(ws: ResolvedWorkspace): TreeNode[] {
  if (!existsSync(ws.kbAbs)) return [];
  const result = walk(ws.kbAbs, "", ws.exclude, ws.kbAbs);
  return result;
}

function walk(absRoot: string, relDir: string, exclude: string[], kbAbs: string): TreeNode[] {
  const abs = join(absRoot, relDir);
  if (!existsSync(abs)) return [];
  const entries = readdirSync(abs).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const out: TreeNode[] = [];
  for (const name of entries) {
    const rel = relDir ? `${relDir}/${name}` : name;
    const absPath = join(abs, name);
    let stat: ReturnType<typeof statSync>;
    try { stat = statSync(absPath); } catch { continue; }
    if (stat.isDirectory()) {
      if (isExcludedDir(rel, exclude)) continue;
      const children = walk(absRoot, rel, exclude, kbAbs);
      // only include dirs that have md files or subdirs with md
      if (children.length === 0) {
        // check if empty folder has no md — still maybe hide? keep if no children then skip
        // keep feature folders even if empty? include
        // We'll include all dirs that aren't excluded, even empty, to show structure
      }
      out.push({ name, path: rel, isDir: true, children });
    } else if (name.endsWith(".md")) {
      if (name.match(/^\d{4}-\d{2}-\d{2}\.md$/)) {
        // daily journal at root — skip for kb, but worklogs handles it; here we keep? spec says loose-notes exclude daily.
        // For KB tree, we exclude daily at root level only
        if (relDir === "") continue;
      }
      const isIndex = relDir !== "" && name === `${relDir.split("/").pop()}.md`;
      // Actually folder index: Feature/Feature.md
      // Check if rel is Feature/Feature.md
      out.push({ name, path: rel, isDir: false, isIndex });
    }
  }
  // Ensure dirs first
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return out;
}

export function listAllNotes(ws: ResolvedWorkspace): { relPath: string; absPath: string }[] {
  if (!existsSync(ws.kbAbs)) return [];
  const out: { relPath: string; absPath: string }[] = [];
  function walk2(relDir: string) {
    const abs = join(ws.kbAbs, relDir);
    if (!existsSync(abs)) return;
    const entries = readdirSync(abs);
    for (const name of entries) {
      const rel = relDir ? `${relDir}/${name}` : name;
      const absPath = join(ws.kbAbs, rel);
      let s: ReturnType<typeof statSync>;
      try { s = statSync(absPath); } catch { continue; }
      if (s.isDirectory()) {
        if (isExcludedDir(rel, ws.exclude)) continue;
        walk2(rel);
      } else if (name.endsWith(".md")) {
        if (relDir === "" && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
        out.push({ relPath: rel, absPath });
      }
    }
  }
  walk2("");
  return out;
}

export function getNoteDetail(ws: ResolvedWorkspace, relPath: string) {
  const abs = resolve(join(ws.kbAbs, relPath));
  // sandbox check
  if (!abs.startsWith(resolve(ws.kbAbs))) return null;
  if (!existsSync(abs)) return null;
  let stat: ReturnType<typeof statSync>;
  try { stat = statSync(abs); } catch { return null; }
  if (stat.isDirectory()) return null;
  let text: string;
  try { text = readFileSync(abs, "utf-8"); } catch { return null; }
  const fallback = basename(relPath, ".md");
  const parsed = parseNote(text, fallback);
  return { ...parsed, rawText: text, absPath: abs, relPath };
}

export function scanWorklogs(ws: ResolvedWorkspace): WorklogSlug[] {
  if (!existsSync(ws.worklogsAbs)) return [];
  const entries = readdirSync(ws.worklogsAbs);
  const out: WorklogSlug[] = [];
  for (const name of entries) {
    const abs = join(ws.worklogsAbs, name);
    let s: ReturnType<typeof statSync>;
    try { s = statSync(abs); } catch { continue; }
    if (!s.isDirectory() || name.startsWith(".")) continue;
    const slug = name;
    const statePath = join(abs, "STATE.md");
    const hasState = existsSync(statePath);
    const files = readdirSync(abs).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
    const entriesArr = files.map((f) => {
      const p = join(abs, f);
      const body = readFileSync(p, "utf-8");
      return { date: f.replace(".md", ""), body, path: `${slug}/${f}` };
    });
    out.push({ slug, statePath: hasState ? `${slug}/STATE.md` : null, entries: entriesArr });
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

export function getWorklogFile(ws: ResolvedWorkspace, rel: string): string | null {
  const abs = resolve(join(ws.worklogsAbs, rel));
  if (!abs.startsWith(resolve(ws.worklogsAbs))) return null;
  if (!existsSync(abs)) return null;
  let stat: ReturnType<typeof statSync>;
  try { stat = statSync(abs); } catch { return null; }
  if (stat.isDirectory()) return null;
  try { return readFileSync(abs, "utf-8"); } catch { return null; }
}
