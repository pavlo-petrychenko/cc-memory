import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, relative, extname } from "node:path";

import { parseNote } from "./parser";

export type NoteFile = {
  absPath: string;
  relPath: string; // kb-relative with .md
  title: string;
  type: string;
  importance: number | null;
  tags: string;
  epic: string;
  body: string;
  rels: { relationType: string; target: string }[];
  mtimeMs: number;
};

export type TreeNode = {
  name: string;
  path: string; // rel path from kb root, "" for root
  type: "dir" | "file";
  children?: TreeNode[];
  isIndex?: boolean;
};

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

export async function walkKb(kbPath: string, exclude: string[]): Promise<NoteFile[]> {
  if (!(await isDir(kbPath))) return [];
  const out: NoteFile[] = [];
  async function walk(dir: string, relDir: string) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const childRel = relDir ? `${relDir}/${name}` : name;
      // check exclude on dirs
      const isDirectory = await isDir(join(dir, name));
      if (isDirectory) {
        const relForExclude = childRel;
        const excluded = exclude.some((e) => {
          const trimmed = e.replace(/^\/+|\/+$/g, "");
          return relForExclude === trimmed || relForExclude.startsWith(trimmed + "/");
        });
        if (excluded) continue;
        await walk(join(dir, name), childRel);
      } else if (name.endsWith(".md")) {
        // exclude daily journal at top level? only if kb root and matches date
        if (relDir === "" && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
        const absPath = join(dir, name);
        try {
          const st = await stat(absPath);
          const text = await readFile(absPath, "utf8");
          const fallback = basename(name, ".md");
          const parsed = parseNote(text, fallback);
          out.push({
            absPath,
            relPath: childRel,
            ...parsed,
            mtimeMs: st.mtimeMs,
          });
        } catch {}
      }
    }
  }
  await walk(kbPath, "");
  return out;
}

export function buildKbTree(notes: NoteFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const dirMap = new Map<string, TreeNode>();
  dirMap.set("", root);
  for (const n of notes) {
    const parts = n.relPath.split("/");
    let curPath = "";
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      curPath = curPath ? `${curPath}/${seg}` : seg;
      let node = dirMap.get(curPath);
      if (!node) {
        node = { name: seg, path: curPath, type: "dir", children: [] };
        dirMap.set(curPath, node);
        parent.children!.push(node);
      }
      parent = node;
    }
    const fileName = parts[parts.length - 1]!;
    const isIndex = parts.length === 2 && fileName === `${parts[0]}.md`;
    parent.children!.push({ name: fileName, path: n.relPath, type: "file", isIndex });
  }
  // sort children: dirs first then files, each alpha
  function sortNode(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

export type WorklogEntry = { date: string; body: string; relPath: string };
export type WorklogSlug = {
  slug: string;
  stateExists: boolean;
  stateBody?: string;
  entries: WorklogEntry[];
};

export async function scanWorklogs(worklogsPath: string): Promise<WorklogSlug[]> {
  if (!(await isDir(worklogsPath))) return [];
  let slugs: string[] = [];
  try {
    slugs = await readdir(worklogsPath);
  } catch {
    return [];
  }
  slugs = slugs.filter((s) => !s.startsWith("."));
  const out: WorklogSlug[] = [];
  for (const slug of slugs.sort()) {
    const slugPath = join(worklogsPath, slug);
    if (!(await isDir(slugPath))) continue;
    let entries: WorklogEntry[] = [];
    let stateBody: string | undefined;
    let stateExists = false;
    try {
      const files = await readdir(slugPath);
      for (const f of files) {
        const abs = join(slugPath, f);
        if (f === "STATE.md" && (await isFile(abs))) {
          stateExists = true;
          try {
            stateBody = await readFile(abs, "utf8");
          } catch {}
        } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(f) && (await isFile(abs))) {
          const body = await readFile(abs, "utf8").catch(() => "");
          entries.push({ date: f.replace(".md", ""), body, relPath: `${slug}/${f}` });
        }
      }
    } catch {}
    entries.sort((a, b) => b.date.localeCompare(a.date));
    out.push({ slug, stateExists, stateBody, entries });
  }
  return out;
}

export function searchNotes(
  notes: NoteFile[],
  q: string,
  filters: { type?: string; tag?: string; feature?: string },
): { note: NoteFile; score: number }[] {
  const query = q.trim().toLowerCase();
  if (!query && !filters.type && !filters.tag && !filters.feature) return [];
  const terms = query ? query.split(/\s+/).filter(Boolean) : [];
  const res: { note: NoteFile; score: number }[] = [];
  for (const n of notes) {
    if (filters.type && n.type !== filters.type) continue;
    if (filters.tag && !n.tags.split(/\s+/).includes(filters.tag)) continue;
    if (filters.feature) {
      const feat = n.relPath.split("/")[0];
      if (feat !== filters.feature) continue;
    }
    if (terms.length === 0) {
      res.push({ note: n, score: 1 });
      continue;
    }
    let score = 0;
    const titleLower = n.title.toLowerCase();
    const tagsLower = n.tags.toLowerCase();
    const bodyLower = n.body.toLowerCase();
    for (const t of terms) {
      if (titleLower.includes(t)) score += 10;
      if (tagsLower.includes(t)) score += 5;
      if (bodyLower.includes(t)) score += 1;
      // also check relPath
      if (n.relPath.toLowerCase().includes(t)) score += 2;
    }
    if (score > 0) res.push({ note: n, score });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 50);
}
