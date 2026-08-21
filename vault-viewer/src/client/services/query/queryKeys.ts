export const qk = {
  workspaces: () => ["workspaces"] as const,
  tree: (ws: string) => ["tree", ws] as const,
  note: (ws: string, path: string) => ["note", ws, path] as const,
  search: (ws: string, q: string, filters: Record<string, string>) => ["search", ws, q, filters] as const,
  graph: (ws: string, focus: string | null, depth: number, full: boolean) => ["graph", ws, focus, depth, full] as const,
  worklog: (ws: string, slug: string) => ["worklog", ws, slug] as const,
};
