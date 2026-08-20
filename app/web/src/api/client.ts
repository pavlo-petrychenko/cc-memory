export type WorkspaceSummary = {
  id: string;
  kb: string;
  worklogs: string;
  indexDb: string;
  match: string[];
  exclude: string[];
  noteCount: number | null;
};

export type KbMap = {
  vaultLabel: string;
  features: {
    name: string;
    hasIndexNote: boolean;
    title: string;
    description: string;
    epic: string;
  }[];
  looseNotes: string[];
};

export type NoteListItem = {
  path: string;
  title: string;
  type: string;
  importance: number | null;
};

export type NoteRead = {
  path: string;
  title: string;
  type: string;
  importance: number | null;
  frontmatter: Record<string, string | readonly string[]>;
  body: string;
  rels: { relationType: string; target: string }[];
  mtimeMs: number;
};

export type Graph = {
  nodes: {
    id: string;
    title: string;
    type: string;
    importance: number | null;
    feature: string;
  }[];
  edges: { src: string; dst: string; relType: string }[];
};

export type SearchHit = { path: string; title: string; snippet: string; score: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export type WorklogNoteItem = NoteListItem & { slug: string; date: string };

export const api = {
  workspaces: () => fetchJson<WorkspaceSummary[]>("/api/workspaces"),
  kbMap: (id: string) =>
    fetchJson<KbMap>(`/api/workspaces/${encodeURIComponent(id)}/kb/map`),
  notes: (id: string, folder?: string) =>
    fetchJson<NoteListItem[]>(
      `/api/workspaces/${encodeURIComponent(id)}/kb/notes${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`,
    ),
  worklogNotes: (id: string) =>
    fetchJson<WorklogNoteItem[]>(
      `/api/workspaces/${encodeURIComponent(id)}/worklogs/notes`,
    ),
  note: (id: string, path: string) =>
    fetchJson<NoteRead>(
      `/api/workspaces/${encodeURIComponent(id)}/kb/note?path=${encodeURIComponent(path)}`,
    ),
  graph: (id: string) =>
    fetchJson<Graph>(`/api/workspaces/${encodeURIComponent(id)}/kb/graph`),
  worklogGraph: (id: string) =>
    fetchJson<Graph>(`/api/workspaces/${encodeURIComponent(id)}/worklogs/graph`),
  search: (id: string, q: string, k = 8) =>
    fetchJson<SearchHit[]>(
      `/api/workspaces/${encodeURIComponent(id)}/kb/search?q=${encodeURIComponent(q)}&k=${k}`,
    ),
  health: () => fetchJson<{ ok: boolean; version: string }>("/api/health"),
  playgroundSearch: (workspaceId: string, query: string, limit = 8, worklog = false) =>
    fetch("/api/playground/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, query, limit, worklog }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json() as Promise<{
        query: string;
        tokens: string[];
        orderedTerms: string[];
        ftsQuery: string;
        phraseQuery: string;
        hits: SearchHit[];
        config: { linkBoost: number; injectMinScore: number };
      }>;
    }),
  playgroundInject: (workspaceId: string, prompt: string) =>
    fetch("/api/playground/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, prompt }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    }),
  playgroundResolve: (cwd?: string) =>
    fetch("/api/playground/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    }),
  playgroundSession: (workspaceId: string, cwd?: string) =>
    fetch("/api/playground/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, cwd }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    }),
};
