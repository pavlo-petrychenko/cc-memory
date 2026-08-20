export type Workspace = { id: string; kb: string; worklogs: string; noteCount: number; indexFresh: string; kbAbs?: string; worklogsAbs?: string; match?: string[] };
export type TreeNode = { name: string; path: string; isDir: boolean; isIndex?: boolean; children?: TreeNode[] };
export type WorklogTree = { slug: string; state: string | null; entries: string[] };
export type TreeResp = { kbTree: TreeNode[]; worklogsTree: WorklogTree[] };
export type NoteResp = { relPath: string; title: string; type: string; importance: number | null; tags: string[]; epic: string | null; body: string; rawText: string; rels: { relationType: string; target: string }[]; backlinks: { path: string; title: string; snippet: string }[]; outgoing: { relationType: string; target: string }[] };
export type SearchHit = { path: string; title: string; type: string; snippet: string; score: number };
export type GraphResp = { nodes: { id: string; title: string; type: string; tags: string[] }[]; edges: { from: string; to: string; type: string }[] };
export type WorklogResp = { slug: string; stateBody: string | null; statePath: string | null; entries: { date: string; body: string; path: string }[] };

const BASE = "/api";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export const api = {
  workspaces: () => j<Workspace[]>(`${BASE}/workspaces`),
  tree: (ws: string) => j<TreeResp>(`${BASE}/tree?workspace=${encodeURIComponent(ws)}`),
  note: (ws: string, path: string) => j<NoteResp>(`${BASE}/note?workspace=${encodeURIComponent(ws)}&path=${encodeURIComponent(path)}`),
  search: (ws: string, q: string, filters: Record<string,string>={}) => {
    const p = new URLSearchParams({ workspace: ws, q, ...filters });
    return j<SearchHit[]>(`${BASE}/search?${p}`);
  },
  graph: (ws: string, focus: string, depth: number, full: boolean) => j<GraphResp>(`${BASE}/graph?workspace=${encodeURIComponent(ws)}&focus=${encodeURIComponent(focus)}&depth=${depth}&full=${full?"1":"0"}`),
  worklog: (ws: string, slug: string) => j<WorklogResp>(`${BASE}/worklog?workspace=${encodeURIComponent(ws)}&slug=${encodeURIComponent(slug)}`),
  reindex: (ws: string) => j<{ total:number }>(`${BASE}/reindex?workspace=${encodeURIComponent(ws)}`, { method: "POST" }),
  fileUrl: (ws: string, path: string) => `${BASE}/file?workspace=${encodeURIComponent(ws)}&path=${encodeURIComponent(path)}`,
};
