const base = "/api";

export async function getWorkspaces(): Promise<{workspaces: any[], source:string}> {
  const r = await fetch(`${base}/workspaces`);
  return r.json();
}
export async function getTree(workspace: string) {
  const r = await fetch(`${base}/tree?workspace=${encodeURIComponent(workspace)}`);
  return r.json() as Promise<{kbTree: any, worklogs: any[], notes: any[]}>;
}
export async function getNote(workspace: string, path: string) {
  const r = await fetch(`${base}/note?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error("not found");
  return r.json();
}
export async function search(workspace: string, q: string, filters: Record<string,string>={}) {
  const p = new URLSearchParams({ workspace, q, ...filters });
  const r = await fetch(`${base}/search?${p}`);
  return r.json() as Promise<{hits: any[]}>;
}
export async function getGraph(workspace: string, focus: string|null, depth:number, full:boolean) {
  const p = new URLSearchParams({ workspace, depth: String(depth), full: full? "1":"0" });
  if (focus) p.set("focus", focus);
  const r = await fetch(`${base}/graph?${p}`);
  return r.json();
}
export async function getWorklog(workspace:string, slug:string) {
  const r = await fetch(`${base}/worklog?workspace=${encodeURIComponent(workspace)}&slug=${encodeURIComponent(slug)}`);
  return r.json();
}
export async function reindex(workspace:string) {
  const r = await fetch(`${base}/reindex?workspace=${encodeURIComponent(workspace)}`, { method:"POST" });
  return r.json();
}
export function fileUrl(workspace:string, path:string) {
  return `${base}/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;
}
