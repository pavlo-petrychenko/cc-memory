import type { NoteFile, TreeNode } from "../../../server/vault.js";

// Pure: buildKbTree — no FS, no ambient state

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

  function sortNode(node: TreeNode): void {
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
