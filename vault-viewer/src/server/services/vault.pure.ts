import type { NoteFile, TreeNode } from "../../../server/vault.js";

// Pure: buildKbTree — no FS, no ambient state

function sortTreeNode(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  node.children.forEach(sortTreeNode);
}

export type Backlink = {
  readonly relPath: string;
  readonly title: string;
  readonly snippet: string;
};

/** Notes whose wikilinks resolve to `relPath` — by path-without-extension or by
 * title — each with a short snippet around the first matching link. */
export function computeBacklinks(
  notes: readonly NoteFile[],
  relPath: string,
  title: string,
  fallback: string,
): Backlink[] {
  const relKey = relPath.replace(/\.md$/, "").toLowerCase();
  const titleLower = title.toLowerCase();
  const fallbackLower = fallback.toLowerCase();
  const backlinks: Backlink[] = [];
  for (const n of notes) {
    if (n.relPath === relPath) continue;
    for (const r of n.rels) {
      const tgt = r.target.toLowerCase();
      if (tgt !== relKey && tgt !== titleLower && tgt !== fallbackLower) continue;
      backlinks.push({
        relPath: n.relPath,
        title: n.title,
        snippet: snippetAroundLink(n.body, r.target),
      });
      break;
    }
  }
  return backlinks;
}

function snippetAroundLink(body: string, target: string): string {
  const idx = body.toLowerCase().indexOf(`[[${target.toLowerCase()}`);
  if (idx >= 0) {
    const start = Math.max(0, idx - 40);
    return body
      .slice(start, idx + 80)
      .replace(/\s+/g, " ")
      .trim();
  }
  return body.slice(0, 80).replace(/\s+/g, " ").trim();
}

export type GraphEdge = {
  readonly source: string;
  readonly target: string;
  readonly relationType: string;
};

/** Resolve every note relation to a concrete note relPath: `${target}.md`, then
 * bare relPath, then case-insensitive title match. Unresolvable targets drop. */
export function buildGraphEdges(notes: readonly NoteFile[]): GraphEdge[] {
  const byRel = new Map(notes.map((n) => [n.relPath, n] as const));
  const byTitleLower = new Map(notes.map((n) => [n.title.toLowerCase(), n] as const));
  const edges: GraphEdge[] = [];
  for (const n of notes) {
    for (const r of n.rels) {
      let targetRel: string | null = null;
      for (const candidate of [`${r.target}.md`, r.target]) {
        if (byRel.has(candidate)) {
          targetRel = candidate;
          break;
        }
      }
      if (!targetRel) {
        targetRel = byTitleLower.get(r.target.toLowerCase())?.relPath ?? null;
      }
      if (targetRel) {
        edges.push({
          source: n.relPath,
          target: targetRel,
          relationType: r.relationType,
        });
      }
    }
  }
  return edges;
}

export type GraphSubgraph = {
  readonly nodes: readonly NoteFile[];
  readonly edges: readonly GraphEdge[];
};

/** Full mode caps at MAX_FULL_NODES notes; focus mode expands a bidirectional
 * BFS frontier to `depth` hops around the focused note. */
export const MAX_FULL_NODES = 500;

export function subgraph(
  notes: readonly NoteFile[],
  edges: readonly GraphEdge[],
  focus: string | null,
  depth: number,
  full: boolean,
): GraphSubgraph {
  let nodes: readonly NoteFile[];
  if (full || !focus) {
    nodes = notes.slice(0, MAX_FULL_NODES);
  } else {
    const visited = expandAroundFocus(edges, focus, depth);
    nodes = notes.filter((n) => visited.has(n.relPath));
  }
  const visible = new Set(nodes.map((n) => n.relPath));
  const kept = edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  return { nodes, edges: kept };
}

function expandAroundFocus(
  edges: readonly GraphEdge[],
  focus: string,
  depth: number,
): Set<string> {
  const visited = new Set<string>([focus]);
  let frontier = new Set<string>([focus]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.source) && !visited.has(e.target)) {
        visited.add(e.target);
        next.add(e.target);
      }
      if (frontier.has(e.target) && !visited.has(e.source)) {
        visited.add(e.source);
        next.add(e.source);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return visited;
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

  sortTreeNode(root);
  return root;
}

// Pure: searchNotes — scoring title×10 tags×5 body×1 relPath×2, frozen

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
      if (n.relPath.toLowerCase().includes(t)) score += 2;
    }
    if (score > 0) res.push({ note: n, score });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 50);
}
